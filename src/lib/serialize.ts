import type {CellSpec, Cell, Notebook, NotebookToc} from "./notebook.js";
import {toNotebook} from "./notebook.js";
import {isEmpty} from "./text.js";

const DEFAULT_THEME = "air" satisfies Notebook["theme"];

export function serialize(notebook: Notebook, {document = globalThis.document} = {}): string {
  const _notebook = document.createElement("notebook");
  _notebook.setAttribute("theme", serializeTheme(notebook.theme));
  if (notebook.readOnly) _notebook.setAttribute("readonly", "");
  if (notebook.toc) _notebook.setAttribute("toc", serializeToc(notebook.toc));
  _notebook.appendChild(document.createTextNode("\n  "));
  const _title = document.createElement("title");
  _title.textContent = notebook.title;
  _notebook.appendChild(_title);
  for (const cell of notebook.cells) {
    _notebook.appendChild(document.createTextNode("\n  "));
    const _cell = document.createElement("script");
    _cell.id = String(cell.id);
    _cell.type = serializeMode(cell.mode);
    _cell.textContent = indent(cell.value.replace(/<(?=\\*\/script(\s|>))/gi, "<\\"));
    if (cell.pinned) _cell.setAttribute("pinned", "");
    if (cell.hidden) _cell.setAttribute("hidden", "");
    if (cell.database) _cell.setAttribute("database", cell.database);
    if (cell.output) _cell.setAttribute("output", cell.output);
    if (cell.format) _cell.setAttribute("format", cell.format);
    _notebook.appendChild(_cell);
  }
  _notebook.appendChild(document.createTextNode("\n"));
  return `<!doctype html>\n${_notebook.outerHTML}\n`;
}

export function deserialize(data: string, {parser = new DOMParser()} = {}): Notebook {
  const document = parser.parseFromString(data, "text/html");
  const _notebook = document.querySelector("notebook");
  const theme = deserializeTheme(_notebook?.getAttribute("theme"));
  const readOnly = _notebook?.hasAttribute("readonly");
  const toc = deserializeToc(_notebook?.getAttribute("toc"));
  const title = document.querySelector("title")?.textContent ?? undefined;
  let maxCellId = 0;
  const cellIds = new Set<number>();
  const cells = Array.from<HTMLScriptElement, CellSpec>(
    document.querySelectorAll("notebook script"),
    (cell) => {
      let id = Math.floor(Number(cell.id));
      if (!isFinite(id) || !(id > 0) || cellIds.has(id)) id = ++maxCellId;
      else if (id > maxCellId) maxCellId = id;
      cellIds.add(id);
      const mode = deserializeMode(cell.getAttribute("type"));
      const value = dedent(cell.textContent?.replace(/<\\(?=\\*\/script(\s|>))/gi, "<") ?? "");
      const pinned = cell.hasAttribute("pinned");
      const hidden = cell.hasAttribute("hidden");
      const format = deserializeFormat(cell.getAttribute("format"));
      const output = cell.getAttribute("output") ?? undefined;
      const database = cell.getAttribute("database") ?? undefined;
      return {id, mode, value, pinned, hidden, format, output, database};
    }
  );
  return toNotebook({title, theme, readOnly, toc, cells});
}

function serializeMode(mode: Cell["mode"]): string {
  switch (mode) {
    case "md":
      return "text/markdown";
    case "html":
      return "text/html";
    case "tex":
      return "application/x-tex";
    case "sql":
      return "application/sql";
    case "sql.view":
      return "application/sql+view";
    case "dot":
      return "text/vnd.graphviz";
    case "node":
      return "application/vnd.node.javascript";
    case "python":
      return "text/x-python";
    case "r":
      return "text/x-r";
    case "ojs":
      return "application/vnd.observable.javascript";
    case "ts":
      return "text/x-typescript";
    default:
      return "module";
  }
}

function deserializeMode(mode: string | null): Cell["mode"] {
  switch (mode) {
    case "text/markdown":
      return "md";
    case "text/html":
      return "html";
    case "application/x-tex":
      return "tex";
    case "application/sql":
      return "sql";
    case "application/sql+view":
      return "sql.view";
    case "text/vnd.graphviz":
      return "dot";
    case "application/vnd.node.javascript":
      return "node";
    case "text/x-python":
      return "python";
    case "text/x-r":
      return "r";
    case "application/vnd.observable.javascript":
      return "ojs";
    case "text/x-typescript":
      return "ts";
    default:
      return "js";
  }
}

function deserializeFormat(format: string | null): Cell["format"] {
  switch (format) {
    case "text":
    case "blob":
    case "buffer":
    case "json":
    case "csv":
    case "tsv":
    case "jpeg":
    case "png":
    case "webp":
    case "gif":
    case "arrow":
    case "parquet":
    case "html":
      return format;
  }
}

function serializeTheme(theme: Notebook["theme"]): string {
  return typeof theme === "string" ? theme : `light-dark(${theme.light}, ${theme.dark})`;
}

function deserializeTheme(theme: string | null | undefined): Notebook["theme"] {
  theme = theme?.trim().toLowerCase() ?? DEFAULT_THEME;
  const match = /^light-dark\(([\w-]+),\s*([\w-]+)\)$/.exec(theme);
  if (match) {
    const [, light, dark] = match;
    return {light, dark} as Notebook["theme"];
  }
  return theme as Notebook["theme"];
}

function serializeToc({style, side}: NotebookToc): string {
  return [style === "float" ? "" : style, side === "right" ? "" : side].filter(Boolean).join(" ");
}

function deserializeToc(toc: string | null | undefined): NotebookToc | undefined {
  if (toc == null) return;
  let style: NotebookToc["style"] = "float";
  let side: NotebookToc["side"] = "right";
  for (const word of toc.toLowerCase().split(/\s+/)) {
    if (word === "column" || word === "marks") style = word;
    else if (word === "left" || word === "right") side = word;
  }
  return {style, side};
}

function dedent(text: string): string {
  const lines = text.split(/\r\n?|\n/);
  if (isEmpty(lines[lines.length - 1])) lines.pop();
  if (isEmpty(lines[0])) lines.shift();
  return lines.map((l) => l.replace(/^ {4}/, "")).join("\n");
}

function indent(text: string): string {
  const lines = text.split(/\r\n?|\n/);
  return `\n${lines.map((l) => (l.trim() ? `    ${l}` : "")).join("\n")}\n  `;
}
