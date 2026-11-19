import {fork, spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {createWriteStream, existsSync, unlinkSync} from "node:fs";
import {mkdir, readFile} from "node:fs/promises";
import {basename, dirname, join, resolve} from "node:path";
import {relative} from "node:path/posix";
import {fileURLToPath} from "node:url";
import type {TemplateLiteral} from "acorn";
import {JSDOM} from "jsdom";
import type {PluginOption, IndexHtmlTransformContext} from "vite";
import {normalizePath} from "vite";
import {getQueryCachePath} from "../databases/index.js";
import {getInterpreterCachePath, getInterpreterCommand} from "../interpreters/index.js";
import {getInterpreterMethod, isInterpreter} from "../lib/interpreters.js";
import type {Cell, Notebook} from "../lib/notebook.js";
import {deserialize} from "../lib/serialize.js";
import {Sourcemap} from "../javascript/sourcemap.js";
import type {TranspiledJavaScript} from "../javascript/transpile.js";
import {transpile} from "../javascript/transpile.js";
import {parseTemplate} from "../javascript/template.js";
import {collectAssets} from "../runtime/stdlib/assets.js";
import {highlight} from "../runtime/stdlib/highlight.js";
import {MarkdownRenderer} from "../runtime/stdlib/md.js";

/**
 * A function which performs a per-page transformation of the template HTML.
 *
 * @param source The source of the template (typically HTML).
 * @param context The Vite plugin context.
 * @returns The transformed template source HTML.
 */
export type TemplateTransform = (
  source: string,
  context: IndexHtmlTransformContext
) => string | Promise<string>;

/**
 * A function which transforms the parsed notebook.
 *
 * @param notebook The current (parsed) notebook.
 * @param context The Vite plugin context.
 * @returns The transformed notebook.
 */
export type NotebookTransform = (
  notebook: Notebook,
  context: IndexHtmlTransformContext
) => Notebook | Promise<Notebook>;

export interface ObservableOptions {
  /** The global window, for the default parser implementations. */
  window?: Pick<typeof globalThis, "DOMParser">;
  /** The parser implementation; defaults to `new window.DOMParser()`. */
  parser?: DOMParser;
  /** The path to the page template; defaults to the default template. */
  template?: string;
  /** An optional function which transforms the template HTML for the current page. */
  transformTemplate?: TemplateTransform;
  /** An optional function which transforms the notebook for the current page. */
  transformNotebook?: NotebookTransform;
}

interface RenderedCell {
  /** the (possibly rewritten) cell */
  cell: Cell;
  /** the static HTML of the cell: its root element, and any pinned source */
  html: string;
  /** the number of top-level nodes in html */
  length: number;
  /** the transpiled cell, or undefined if the cell is static */
  transpiled?: TranspiledJavaScript;
  /** a hash of the cell’s rendered content, for incremental updates */
  key: string;
}

interface RenderedNotebook {
  /** the rendered page (sans the notebook’s styles and script) */
  html: string;
  /** the rendered document title */
  title: string;
  /** the notebook theme */
  theme: Notebook["theme"];
  /** the static assets referenced by the notebook */
  assets: string[];
  /** the rendered cells */
  cells: RenderedCell[];
  /** a hash of everything other than cells; if this changes, a full reload is needed */
  shell: string;
}

/**
 * In the preview server, the cells of each page are served as a separate
 * notebook module, identified by this query suffix on the page’s path. This
 * allows incremental updates via hot module replacement.
 */
const NOTEBOOK_QUERY = "?observable-notebook";

export function observable({
  window = new JSDOM().window,
  parser = new window.DOMParser(),
  template = fileURLToPath(import.meta.resolve("../templates/default.html")),
  transformTemplate = (template) => template,
  transformNotebook = (notebook) => notebook
}: ObservableOptions = {}): PluginOption {
  let root = process.cwd();

  /** The most recently-rendered notebooks in the preview server, by filename. */
  const notebooks = new Map<
    string,
    {context: IndexHtmlTransformContext; notebook: RenderedNotebook}
  >();

  async function render(
    input: string,
    context: IndexHtmlTransformContext,
    {dev = false}: {dev?: boolean} = {} // if true, display errors in cells
  ): Promise<RenderedNotebook> {
    const notebook = await transformNotebook(deserialize(input, {parser}), context);
    const templateHtml = await transformTemplate(await readFile(template, "utf-8"), context);
    const document = parser.parseFromString(templateHtml, "text/html");
    const rendered: RenderedCell[] = [];
    const assets = new Set<string>();
    const md = MarkdownRenderer({document});

    const {version} = (await import("../../package.json", {with: {type: "json"}})).default;
    let generator = document.querySelector("meta[name=generator]");
    generator ??= document.head.appendChild(document.createElement("meta"));
    generator.setAttribute("name", "generator");
    generator.setAttribute("content", `Observable Notebook Kit v${version}`);

    let title = document.querySelector("title");
    title ??= document.head.appendChild(document.createElement("title"));
    title.insertBefore(document.createTextNode(notebook.title), title.firstChild);

    /**
     * Renders the static content of the given cell into the given div, and
     * rewrites the cell as needed (e.g., for interpreters). Returns true if
     * the cell is static, and hence does not need to be defined.
     */
    async function renderCell(cell: Cell, div: HTMLDivElement): Promise<boolean> {
      const {mode, hidden, format, value} = cell;
      let isStatic = false;
      if (mode === "md" && !hidden) {
        const template = parseTemplate(value);
        if (!template.expressions.length && !cell.output) isStatic = true;
        const content = md([unescapeDollarBackslashCurly(stripExpressions(template, value))]);
        const codes = content.querySelectorAll<HTMLElement>("code[class^=language-]");
        await Promise.all(Array.from(codes, highlight));
        div.appendChild(content);
      } else if (mode === "html" && !hidden) {
        const template = parseTemplate(value);
        if (!template.expressions.length && !cell.output) isStatic = true;
        div.innerHTML = stripExpressions(template, value);
      } else if (mode === "sql" && cell.database && !cell.database.startsWith("var:")) {
        const template = parseTemplate(value);
        if (!template.expressions.length) {
          const dir = dirname(context.filename);
          const cachePath = await getQueryCachePath(context.filename, cell.database, [value]);
          if (!existsSync(cachePath)) {
            const args = ["--root", dir, "--database", cell.database, value];
            const child = fork(fileURLToPath(import.meta.resolve("../../bin/query.js")), args);
            await new Promise<void>((resolve, reject) => {
              child.on("error", reject);
              child.on("exit", (code) => {
                if (code === 0) return resolve();
                unlinkSyncIfExists(cachePath); // don’t pollute cache with failure
                reject(new Error(`${cell.database} query exited with ${code}`));
              });
            });
          }
          cell.mode = "js";
          cell.value = `FileAttachment(${JSON.stringify(relative(dir, cachePath))}).json().then(DatabaseClient.revive)${hidden ? "" : `.then(Inputs.table)${cell.output ? ".then(view)" : ""}`}`;
          if (cell.output) {
            cell.value = `const ${cell.output} = ${cell.value};`;
            cell.output = undefined;
          }
        }
      } else if (isInterpreter(mode)) {
        const {filename: sourcePath} = context;
        const sourceDir = dirname(sourcePath);
        const cachePath = await getInterpreterCachePath(sourcePath, mode, format, value);
        if (!existsSync(cachePath)) {
          await mkdir(dirname(cachePath), {recursive: true});
          const [command, args] = getInterpreterCommand(mode);
          const child = spawn(command, args, {cwd: sourceDir});
          child.stdin.end(value);
          child.stderr.pipe(process.stderr);
          child.stdout.pipe(createWriteStream(cachePath));
          await new Promise<void>((resolve, reject) => {
            child.on("error", reject);
            child.on("exit", (code) => {
              if (code === 0) return resolve();
              unlinkSyncIfExists(cachePath); // don’t pollute cache with failure
              reject(new Error(`${mode} interpreter exited with ${code}`));
            });
          });
        }
        if (format === "html" && !hidden) {
          div.innerHTML = await readFile(cachePath, "utf-8");
          if (!cell.output) isStatic = true;
        }
        cell.mode = "js";
        cell.value = `FileAttachment(${JSON.stringify(relative(sourceDir, cachePath))})${getInterpreterMethod(format)}${hidden || !cell.output ? "" : ".then(display)"}`;
        if (cell.output) {
          cell.value = `const ${cell.output} = ${cell.value};`;
          cell.output = undefined;
        }
      }
      return isStatic;
    }

    let main = document.querySelector("main");
    main ??= document.body.appendChild(document.createElement("main"));
    for (const cell of notebook.cells) {
      const {id, mode, pinned, value} = cell;
      const contents = document.createDocumentFragment();
      const div = contents.appendChild(document.createElement("div"));
      let transpiled: TranspiledJavaScript | undefined;
      div.id = `cell-${id}`;
      div.className = "observablehq observablehq--cell";
      try {
        const isStatic = await renderCell(cell, div);
        if (!isStatic) transpiled = transpile(cell, {resolveFiles: true});
      } catch (error) {
        // In the preview server, display the error in the cell rather than
        // failing the entire page.
        if (!dev) throw error;
        while (div.lastChild) div.lastChild.remove();
        transpiled = transpileError(error);
      }
      collectAssets(assets, div);
      if (pinned) {
        const pre = contents.appendChild(document.createElement("pre"));
        const code = pre.appendChild(document.createElement("code"));
        code.className = `language-${mode}`;
        code.textContent = value;
        await highlight(code);
      }
      const html = Array.from(contents.children, (node) => node.outerHTML).join("");
      const length = contents.childNodes.length;
      const definition = transpiled && renderDefinition(cell, transpiled, "assets");
      const key = hash([id, html, definition]);
      rendered.push({cell, html, length, transpiled, key});
      main.appendChild(contents);
    }

    // Don’t error if assets are missing (matching Vite’s behavior).
    filterMissingAssets(assets, dirname(context.filename));

    return {
      html: document.documentElement.outerHTML,
      title: title.textContent ?? "",
      theme: notebook.theme,
      assets: Array.from(assets),
      cells: rendered,
      shell: hash([templateHtml, notebook.theme])
    };
  }

  return {
    name: "observable",
    buildStart() {
      this.addWatchFile(template);
    },
    async hotUpdate({type, file, modules, read}) {
      if (this.environment.name !== "client") return;
      if (file === resolve(template)) {
        this.environment.hot.send({type: "full-reload"});
        return;
      }

      // If this is a notebook that has been loaded in the preview server, re-
      // render it. If only cells changed, update the notebook module, which the
      // page accepts to apply the changes incrementally; otherwise, fall back
      // to Vite’s default behavior (a full reload).
      if (type !== "update") return;
      const filename = normalizePath(file);
      const module = modules.find((module) => module.id === filename + NOTEBOOK_QUERY);
      const previous = notebooks.get(filename);
      if (!module || !previous) return;
      const {context} = previous;
      const notebook = await render(await read(), context, {dev: true});
      notebooks.set(filename, {context, notebook});
      if (notebook.shell !== previous.notebook.shell) return;
      return [module];
    },
    configResolved(config) {
      root = config.root;
    },
    async load(id) {
      if (!id.endsWith(NOTEBOOK_QUERY)) return;
      const filename = id.slice(0, -NOTEBOOK_QUERY.length);
      let entry = notebooks.get(filename);
      if (!entry) {
        // The notebook module is normally rendered by transformIndexHtml; but
        // in case it’s requested directly, render it on demand.
        const context: IndexHtmlTransformContext = {path: `/${relative(root, filename)}`, filename};
        const notebook = await render(await readFile(filename, "utf-8"), context, {dev: true});
        entry = {context, notebook};
        notebooks.set(filename, entry);
      }
      return renderNotebookModule(entry.notebook);
    },
    transformIndexHtml: {
      order: "pre",
      async handler(input, context) {
        if (context.path.startsWith("/.observable/")) return input;
        const {server} = context;
        if (!server) {
          const notebook = await render(input, context);
          return renderPage(notebook, renderScript(notebook));
        }
        const filename = normalizePath(context.filename);
        const notebook = await render(input, context, {dev: true});
        notebooks.set(filename, {context, notebook});
        const {moduleGraph} = server.environments.client;
        const module = moduleGraph.getModuleById(filename + NOTEBOOK_QUERY);
        if (module) moduleGraph.invalidateModule(module);
        return renderPage(notebook, renderHotScript(notebook, basename(filename)));
      }
    }
  };
}

/** Renders the page, injecting the notebook’s theme and the given script. */
function renderPage({html, theme}: RenderedNotebook, script: string): string {
  const i = html.indexOf("</body>");
  if (!(i >= 0)) throw new Error("body not found");
  return (
    `<!doctype html>` +
    html.slice(0, i) +
    `<style type="text/css">${
      typeof theme === "string"
        ? `
@import url("observable:styles/theme-${theme}.css");`
        : `
@import url("observable:styles/theme-${theme.light}.css") (prefers-color-scheme: light);
@import url("observable:styles/theme-${theme.dark}.css") (prefers-color-scheme: dark);`
    }
</style><script type="module">${script}</script>` +
    html.slice(i)
  );
}

/** Renders the script that defines the notebook’s cells (for production). */
function renderScript({assets, cells}: RenderedNotebook): string {
  return `
import {define} from "observable:runtime";${renderAssetImports(assets)}${
    assets.length > 0
      ? `

const assets = ${renderAssetMap(assets)};`
      : ""
  }
${cells
  .filter(({transpiled}) => transpiled)
  .map(
    ({cell, transpiled}) => `
define(
  {
    root: document.getElementById(\`cell-${cell.id}\`),
    expanded: [],
    variables: []
  },
  ${renderDefinition(cell, transpiled!, assets.length > 0 ? "assets" : "undefined", true)}
);`
  )
  .join("")}
`;
}

/**
 * Renders the script that imports the notebook module and defines the
 * notebook’s cells, with support for incremental updates (for preview).
 */
function renderHotScript({cells}: RenderedNotebook, name: string): string {
  const specifier = escapeScript(JSON.stringify(`./${name}${NOTEBOOK_QUERY}`));
  const initial = escapeScript(
    JSON.stringify(cells.map(({cell, key, length}) => [cell.id, key, length]))
  );
  return `
import {hot} from "observable:runtime/hot";
import * as notebook from ${specifier};
const update = hot(notebook, ${initial});
if (import.meta.hot) import.meta.hot.accept(${specifier}, (notebook) => notebook && update(notebook));
`;
}

/** Renders the notebook module (for preview); see HotNotebook. */
function renderNotebookModule({title, assets, cells}: RenderedNotebook): string {
  return `${renderAssetImports(assets).slice(1)}
const assets = ${assets.length > 0 ? renderAssetMap(assets) : "new Map()"};
export const title = ${JSON.stringify(title)};
export const cells = [${cells
    .map(
      ({cell, html, transpiled, key}) => `
  {
    id: ${cell.id},
    key: ${JSON.stringify(key)},
    html: ${JSON.stringify(html)},
    definition: ${transpiled ? renderDefinition(cell, transpiled, "assets") : "undefined"}
  }`
    )
    .join(",")}
];
`;
}

function renderAssetImports(assets: string[]): string {
  return assets
    .map(
      (asset, i) => `
import asset${i + 1} from ${JSON.stringify(`${asset}?url`)};`
    )
    .join("");
}

function renderAssetMap(assets: string[]): string {
  return `new Map([
${assets.map((asset, i) => `  [${JSON.stringify(asset)}, asset${i + 1}]`).join(",\n")}
])`;
}

function renderDefinition(
  cell: Cell,
  transpiled: TranspiledJavaScript,
  assets: string,
  inline = false
): string {
  return `{
    id: ${cell.id},
    body: ${inline ? escapeScript(transpiled.body) : transpiled.body},
    inputs: ${JSON.stringify(transpiled.inputs)},
    outputs: ${JSON.stringify(transpiled.outputs)},
    output: ${JSON.stringify(transpiled.output)},
    display: ${cell.mode === "js" || cell.mode === "ts"},
    displayMode: ${JSON.stringify(cell.mode === "sql" ? "table" : "default")},
    assets: ${assets},
    autodisplay: ${transpiled.autodisplay},
    autoview: ${transpiled.autoview},
    automutable: ${transpiled.automutable}
  }`;
}

/** Returns a cell definition that throws the given error (for the preview server). */
function transpileError(error: unknown): TranspiledJavaScript {
  const type = error instanceof SyntaxError ? "SyntaxError" : "Error";
  const message = error instanceof Error ? error.message : String(error);
  return {
    body: `() => {\nthrow new ${type}(${JSON.stringify(message)});\n}`,
    inputs: [],
    outputs: [],
    autodisplay: true
  };
}

function hash(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("base64url").slice(0, 16);
}

function filterMissingAssets(assets: Set<string>, dir: string): void {
  for (const asset of assets) {
    if (!existsSync(join(dir, asset))) {
      console.warn(`warning: asset not found: ${asset}`);
      assets.delete(asset);
    }
  }
}

function stripExpressions(template: TemplateLiteral, input: string): string {
  const source = new Sourcemap(input);
  let index = template.start;
  for (const q of template.quasis) {
    if (q.start > index) {
      // In a case such as <img src=${…} style=…>, we must replace the
      // placeholder with a non-empty value or it will change the interpre-
      // tation of the subsequent attribute to be part of the src attribute!
      // But we also don’t want to use a non-empty src attribute because that
      // would cause the browser to load an asset that does not exist (before
      // it is replaced by the client-generated content).
      if (hasPrecedingEquals(input, index)) {
        source.replaceLeft(index, q.start, '""');
      } else {
        source.delete(index, q.start);
      }
    }
    index = q.end;
  }
  return String(source);
}

function unescapeDollarBackslashCurly(input: string): string {
  return input.replace(/(\$\\*)\\({)/g, "$1$2");
}

/** Returns true if the specified character is preceded by an equals sign, ignoring whitespace. */
function hasPrecedingEquals(input: string, index: number): boolean {
  let i = index - 1;
  while (isSpaceCode(input.charCodeAt(i))) --i;
  return input.charCodeAt(i) === CODE_EQ;
}

const CODE_TAB = 9,
  CODE_LF = 10,
  CODE_FF = 12,
  CODE_CR = 13,
  CODE_SPACE = 32,
  CODE_EQ = 61;

/** Returns true if the specified character code is considered whitespace by HTML. */
function isSpaceCode(code: number): boolean {
  return (
    code === CODE_TAB ||
    code === CODE_LF ||
    code === CODE_FF ||
    code === CODE_SPACE ||
    code === CODE_CR
  );
}

/** Note: only suitable for use in a script element. */
function escapeScript(script: string): string {
  return script.replace(/<\/script>/g, "<\\/script>"); // TODO handle other contexts
}

function unlinkSyncIfExists(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}
