import {existsSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import type {TemplateLiteral} from "acorn";
import {JSDOM} from "jsdom";
import type {PluginOption, IndexHtmlTransformContext} from "vite";
import type {Cell} from "../lib/notebook.js";
import {deserialize} from "../lib/serialize.js";
import {Sourcemap} from "../javascript/sourcemap.js";
import {transpile} from "../javascript/transpile.js";
import {parseTemplate} from "../javascript/template.js";
import {collectAssets} from "../runtime/stdlib/assets.js";
import {highlight} from "../runtime/stdlib/highlight.js";
import {MarkdownRenderer} from "../runtime/stdlib/md.js";

export interface ObservableOptions {
  /** The global window, for the default parser and serializer implementations. */
  window?: Pick<typeof globalThis, "DOMParser" | "XMLSerializer">;
  /** The parser implementation; defaults to `new window.DOMParser()`. */
  parser?: DOMParser;
  /** The serializer implementation; defaults to `new window.XMLSerializer()`. */
  serializer?: XMLSerializer;
  /** The path to the page template; defaults to the default template. */
  template?: string;
  /** A function which performs a per-page transformation of the template HTML. */
  transformTemplate?: (template: string, context: IndexHtmlTransformContext) => string | Promise<string>;
}

export function observable({
  window = new JSDOM().window,
  parser = new window.DOMParser(),
  serializer = new window.XMLSerializer(),
  template = fileURLToPath(import.meta.resolve("../templates/default.html")),
  transformTemplate = undefined
}: ObservableOptions = {}): PluginOption {
  return {
    name: "observable",
    buildStart() {
      this.addWatchFile(template);
    },
    handleHotUpdate(context) {
      if (context.file === resolve(template)) {
        context.server.hot.send({type: "full-reload"});
      }
    },
    transformIndexHtml: {
      order: "pre",
      async handler(input, context) {
        const notebook = deserialize(input, {parser});
        let tsource = await readFile(template, "utf-8");
        if (transformTemplate !== undefined) {
          tsource = await transformTemplate(tsource, context);
        }
        const document = parser.parseFromString(tsource, "text/html");
        const statics = new Set<Cell>();
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

        let cells = document.querySelector("main");
        cells ??= document.body.appendChild(document.createElement("main"));
        for (const cell of notebook.cells) {
          const {id, mode, pinned, value} = cell;
          const contents = document.createDocumentFragment();
          const div = contents.appendChild(document.createElement("div"));
          div.id = `cell-${id}`;
          div.className = "observablehq observablehq--cell";
          if (mode === "md") {
            const template = parseTemplate(value);
            if (!template.expressions.length) statics.add(cell);
            const content = md([stripExpressions(template, value)]);
            const codes = content.querySelectorAll<HTMLElement>("code[class^=language-]");
            await Promise.all(Array.from(codes, highlight));
            div.appendChild(content);
          } else if (mode === "html") {
            const template = parseTemplate(value);
            if (!template.expressions.length) statics.add(cell);
            div.innerHTML = stripExpressions(template, value);
          }
          collectAssets(assets, div);
          if (pinned) {
            const pre = contents.appendChild(document.createElement("pre"));
            const code = pre.appendChild(document.createElement("code"));
            code.className = `language-${mode}`;
            code.textContent = value;
            await highlight(code);
          }
          cells.appendChild(contents);
        }

        // Don’t error if assets are missing (matching Vite’s behavior).
        filterMissingAssets(assets, dirname(context.filename));

        const output = serializer.serializeToString(document);
        const i = output.indexOf("</body>");
        if (!(i >= 0)) throw new Error("body not found");
        return (
          output.slice(0, i) +
          `<style type="text/css">
@import url("observable:styles/theme-${notebook.theme}.css");
</style><script type="module">
import {define} from "observable:runtime/define";${Array.from(assets)
            .map(
              (asset, i) => `
import asset${i + 1} from ${JSON.stringify(`${asset}?url`)};`
            )
            .join("")}${
            assets.size > 0
              ? `

const assets = new Map([
${Array.from(assets)
  .map((asset, i) => `  [${JSON.stringify(asset)}, asset${i + 1}]`)
  .join(",\n")}
]);`
              : ""
          }
${notebook.cells
  .filter((cell) => !statics.has(cell))
  .map((cell) => {
    const transpiled = transpile(cell.value, cell.mode, {resolveFiles: true});
    return `
define(
  {
    root: document.getElementById(\`cell-${cell.id}\`),
    expanded: [],
    variables: []
  },
  {
    id: ${cell.id},
    body: ${escapeScript(transpiled.body)},
    inputs: ${JSON.stringify(transpiled.inputs)},
    outputs: ${JSON.stringify(transpiled.outputs)},
    output: ${JSON.stringify(transpiled.output)},
    assets: ${assets.size > 0 ? "assets" : "undefined"},
    autodisplay: ${transpiled.autodisplay},
    autoview: ${transpiled.autoview},
    automutable: ${transpiled.automutable}
  }
);`;
  })
  .join("")}
</script>` +
          output.slice(i)
        );
      }
    }
  };
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
