import {fork, spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {createWriteStream, existsSync, unlinkSync} from "node:fs";
import {mkdir, readFile, stat} from "node:fs/promises";
import {basename, dirname, join, resolve} from "node:path";
import {relative} from "node:path/posix";
import {fileURLToPath} from "node:url";
import type {TemplateLiteral} from "acorn";
import {JSDOM} from "jsdom";
import {Mime} from "mime/lite";
import standardTypes from "mime/types/standard.js";
import type {DevEnvironment, EnvironmentModuleNode, ResolvedConfig} from "vite";
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
import type {HotInitialCell} from "../runtime/hot.js";
import type {FileInfo} from "../runtime/stdlib/fileAttachment.js";
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

interface Asset {
  /** the import path of the asset, typically starting with ./ */
  path: string;
  /** for the preview server, the modification time of the asset (for cache-busting) */
  mtime?: number;
}

interface FileReference extends FileInfo {
  /** the name of the file, as passed to FileAttachment */
  name: string;
  /** the import path of the file (typically starting with ./) */
  path: string;
}

interface RenderedNotebook {
  /** the render context */
  context: IndexHtmlTransformContext;
  /** the rendered page (sans the notebook’s styles and script) */
  html: string;
  /** the rendered document title */
  title: string;
  /** the notebook theme */
  theme: Notebook["theme"];
  /** the static assets referenced by the notebook */
  assets: Asset[];
  /** the existing files referenced by the notebook’s cells */
  files: FileReference[];
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
const OBSERVABLE_QUERY = "?observable";

/** The standard MIME types, plus some data formats commonly used by notebooks. */
const mime = new Mime(standardTypes, {
  "application/vnd.apache.arrow.file": ["arrow"],
  "application/vnd.apache.parquet": ["parquet"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.sqlite3": ["sqlite"]
});

export function observable({
  window = new JSDOM().window,
  parser = new window.DOMParser(),
  template = fileURLToPath(import.meta.resolve("../templates/default.html")),
  transformTemplate = (template) => template,
  transformNotebook = (notebook) => notebook
}: ObservableOptions = {}): PluginOption {
  /** The most recently-rendered notebooks in the preview server, by filename. */
  const notebooks = new Map<string, RenderedNotebook>();

  /** The resolved Vite config. */
  let config: ResolvedConfig;

  /**
   * Renders the given notebook. If a dev environment is specified (i.e., in the
   * preview server), errors are displayed in cells rather than thrown, and the
   * cell keys reflect the current state of the cells’ local dependencies.
   */
  async function render(
    input: string,
    context: IndexHtmlTransformContext,
    environment?: DevEnvironment
  ): Promise<RenderedNotebook> {
    const notebook = await transformNotebook(deserialize(input, {parser}), context);
    const templateHtml = await transformTemplate(await readFile(template, "utf-8"), context);
    const document = parser.parseFromString(templateHtml, "text/html");
    const rendered: RenderedCell[] = [];
    const assets = new Set<string>();
    const files = new Set<string>();
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
        if (!isStatic) transpiled = transpile(cell);
      } catch (error) {
        // In the preview server, display the error in the cell rather than
        // failing the entire page.
        if (!environment) throw error;
        while (div.lastChild) div.lastChild.remove();
        transpiled = transpileError(error);
      }
      const cellAssets = new Set<string>();
      collectAssets(cellAssets, div);
      for (const asset of cellAssets) assets.add(asset);
      if (transpiled?.files) for (const file of transpiled.files) files.add(file);
      if (pinned) {
        const pre = contents.appendChild(document.createElement("pre"));
        const code = pre.appendChild(document.createElement("code"));
        code.className = `language-${mode}`;
        code.textContent = value;
        await highlight(code);
      }
      const nodes = Array.from(contents.children);
      const html = nodes.map((node) => node.outerHTML).join("");
      const length = nodes.length;
      const definition = transpiled && renderDefinition(cell, transpiled, "assets");
      const dependencies = environment
        ? await getDependencies(environment, context.filename, [
            ...cellAssets,
            ...(transpiled ? getLocalDependencies(transpiled) : [])
          ])
        : [];
      const key = hash([id, html, definition, dependencies]);
      rendered.push({cell, html, length, transpiled, key});
      main.appendChild(contents);
    }

    // Don’t error if assets are missing (matching Vite’s behavior).
    const dir = dirname(context.filename);
    filterMissingAssets(assets, dir);

    return {
      context,
      html: document.documentElement.outerHTML,
      title: title.textContent ?? "",
      theme: notebook.theme,
      assets: await Promise.all(
        Array.from(assets, async (path) => ({
          path,
          mtime: environment && (await getModifiedTime(join(dir, path)))
        }))
      ),
      files: await resolveFiles(files, dir, config),
      cells: rendered,
      shell: hash([templateHtml, notebook.theme])
    };
  }

  return {
    name: "observable",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    buildStart() {
      this.addWatchFile(template);
    },
    async hotUpdate({type, file, modules, read}) {
      if (this.environment.name !== "client") return;
      const filename = normalizePath(file);
      if (filename === normalizePath(resolve(template))) {
        this.environment.hot.send({type: "full-reload"});
        return;
      }

      // Re-render any loaded notebooks affected by this change: either the
      // notebook itself changed, or one of its cells’ local dependencies (such
      // as an imported module, a file attachment, or a static asset referenced
      // by a Markdown or HTML cell). The page accepts updates to the notebook
      // module, redefining only the cells whose keys changed. The notebook
      // module must be invalidated explicitly; otherwise, for a changed
      // dependency, Vite would only update the import timestamps in the
      // previously-transformed code, without reloading the notebook module.
      let self: EnvironmentModuleNode | undefined;
      for (const module of findNotebookModules(modules)) {
        const path = module.id!.slice(0, -OBSERVABLE_QUERY.length);
        const previous = notebooks.get(path);
        if (!previous) continue;
        if (type === "delete" && path === filename) {
          notebooks.delete(path); // can’t re-render; Vite’s default will reload
          continue;
        }
        const {context} = previous;
        const input = path === filename ? await read() : await readFile(path, "utf-8");
        const notebook = await render(input, context, this.environment);
        notebooks.set(path, notebook);
        this.environment.moduleGraph.invalidateModule(module);
        if (path === filename && notebook.shell === previous.shell) self = module;
      }

      // If the notebook itself changed and only its cells changed, update just
      // the notebook module; otherwise, fall back to Vite’s default behavior
      // (for a notebook, a full reload). Note that a change to a dependency
      // cannot change the template or theme.
      if (self && type === "update") return [self];
    },
    async load(id) {
      if (!id.endsWith(OBSERVABLE_QUERY) || this.environment.mode !== "dev") return;
      const filename = id.slice(0, -OBSERVABLE_QUERY.length);
      const notebook = notebooks.get(filename);
      if (!notebook) throw new Error(`notebook not loaded: ${filename}`);
      return renderNotebookModule(notebook);
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
        const environment = server.environments.client;
        const notebook = await render(input, context, environment);
        notebooks.set(filename, notebook);
        const module = environment.moduleGraph.getModuleById(filename + OBSERVABLE_QUERY);
        if (module) environment.moduleGraph.invalidateModule(module);
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
function renderScript({assets, files, cells}: RenderedNotebook): string {
  return `
import {define, registerFile, requireFileRegistration} from "observable:runtime";${renderAssetImports(assets)}${
    assets.length > 0
      ? `

const assets = ${renderAssetMap(assets)};`
      : ""
  }

requireFileRegistration(true);${files
    .map(
      (file) => `
registerFile(${escapeScript(JSON.stringify(file.name))}, ${escapeScript(renderFileInfo(file))});`
    )
    .join("")}
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
  const specifier = escapeScript(JSON.stringify(`./${name}${OBSERVABLE_QUERY}`));
  const initial = escapeScript(JSON.stringify(cells.map<HotInitialCell>(({cell, key, length}) => ({id: cell.id, key, length})))); // prettier-ignore
  return `
import {hot} from "observable:runtime/hot";
import * as notebook from ${specifier};
const update = hot(notebook, ${initial});
if (import.meta.hot) import.meta.hot.accept(${specifier}, (notebook) => notebook && update(notebook));
`;
}

/**
 * Renders the notebook module (for preview); see HotNotebook. The asset URLs
 * include the assets’ modification times, so that when an asset changes, the
 * browser loads the new asset rather than using its in-memory cache. (Small
 * assets are inlined by Vite as data: URLs, which don’t need versioning.)
 */
function renderNotebookModule({title, assets, files, cells}: RenderedNotebook): string {
  return `${renderAssetImports(assets).slice(1)}${
    assets.some(({mtime}) => mtime !== undefined)
      ? `
const versionAsset = (url, version) => url.startsWith("data:") ? url : \`\${url}\${url.includes("?") ? "&" : "?"}t=\${version}\`;`
      : ""
  }
export const assets = ${assets.length > 0 ? renderAssetMap(assets) : "new Map()"};
export const files = ${files.length > 0 ? renderFileMap(files) : "new Map()"};
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

/** Returns the notebook modules that are (or transitively import) the given modules. */
function findNotebookModules(modules: EnvironmentModuleNode[]): EnvironmentModuleNode[] {
  const notebooks: EnvironmentModuleNode[] = [];
  const queue = new Set(modules);
  for (const module of queue) {
    if (module.id?.endsWith(OBSERVABLE_QUERY)) {
      notebooks.push(module);
    } else {
      for (const importer of module.importers) {
        queue.add(importer);
      }
    }
  }
  return notebooks;
}

/**
 * Returns the given local dependencies of a cell (imported modules, file
 * attachments, and static assets) as [path, mtime] pairs, resolved the same
 * way that Vite will later resolve them, so that the cell is re-rendered if any
 * of its dependencies change. This includes transitive imports, if known to
 * Vite’s module graph (i.e., the imported modules have already been loaded),
 * excluding packages.
 */
async function getDependencies(
  environment: DevEnvironment,
  importer: string,
  specifiers: string[]
): Promise<[path: string, mtime: number | undefined][]> {
  const {moduleGraph, pluginContainer} = environment;
  const paths = new Set<string>();
  for (const specifier of specifiers) {
    const resolved = await pluginContainer.resolveId(specifier, importer);
    if (!resolved || resolved.external) continue;
    const queue = [cleanUrl(resolved.id)];
    for (const path of queue) {
      if (paths.has(path) || path.includes("/node_modules/")) continue;
      paths.add(path);
      for (const module of moduleGraph.getModulesByFile(path) ?? []) {
        for (const imported of module.importedModules) {
          if (imported.file) queue.push(imported.file);
        }
      }
    }
  }
  return Promise.all(Array.from(paths, async (path) => [path, await getModifiedTime(path)]));
}

async function getModifiedTime(path: string): Promise<number | undefined> {
  return stat(path).then(
    (s) => Math.round(s.mtimeMs),
    () => undefined
  );
}

function cleanUrl(id: string): string {
  return id.replace(/[?#].*$/, "");
}

/** Returns the specifiers of the given cell’s local imports and files. */
function getLocalDependencies({
  imports = new Set(),
  files = new Set()
}: TranspiledJavaScript): string[] {
  const dependencies = Array.from(imports).filter(isPathSpecifier);
  for (const file of files) {
    dependencies.push(isPathSpecifier(file) ? file : `./${file}`);
  }
  return dependencies;
}

function isPathSpecifier(specifier: string): boolean {
  return /^\.{0,2}\//.test(specifier);
}

/**
 * Resolves the given file names (as passed to FileAttachment, relative to the
 * given notebook directory) to file references, including their MIME type,
 * modification time, and size. Files that do not exist are omitted, such that
 * attempting to load them throws an error.
 */
async function resolveFiles(
  names: Iterable<string>,
  dir: string,
  {root}: ResolvedConfig
): Promise<FileReference[]> {
  const files = await Promise.all(
    Array.from(names, async (name): Promise<FileReference | undefined> => {
      const path = join(name.startsWith("/") ? root : dir, name);
      const stats = await stat(path).catch(() => undefined);
      if (!stats?.isFile()) return void console.warn(`warning: file not found: ${name}`);
      return {
        name,
        path: isPathSpecifier(name) ? name : `./${name}`,
        mimeType: mime.getType(name) ?? undefined,
        lastModified: Math.round(stats.mtimeMs),
        size: stats.size
      };
    })
  );
  return files.filter((file) => file !== undefined);
}

/**
 * Renders the FileInfo for the given file. Paths are resolved via
 * import.meta.url, so that Vite treats the file as an asset.
 */
function renderFileInfo({path, mimeType, lastModified, size}: FileReference): string {
  return `{path: new URL(${JSON.stringify(path)}, import.meta.url).href${
    mimeType === undefined ? "" : `, mimeType: ${JSON.stringify(mimeType)}`
  }${lastModified === undefined ? "" : `, lastModified: ${lastModified}`}${
    size === undefined ? "" : `, size: ${size}`
  }}`;
}

function renderFileMap(files: FileReference[]): string {
  return `new Map([
${files.map((file) => `  [${JSON.stringify(file.name)}, ${renderFileInfo(file)}]`).join(",\n")}
])`;
}

function renderAssetImports(assets: Asset[]): string {
  return assets
    .map(
      ({path}, i) => `
import asset${i + 1} from ${JSON.stringify(`${path}?url`)};`
    )
    .join("");
}

function renderAssetMap(assets: Asset[]): string {
  return `new Map([
${assets
  .map(({path, mtime}, i) => {
    const url = mtime === undefined ? `asset${i + 1}` : `versionAsset(asset${i + 1}, ${mtime})`;
    return `  [${JSON.stringify(path)}, ${url}]`;
  })
  .join(",\n")}
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
