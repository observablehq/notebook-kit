import {isInterpreter} from "./interpreters.js";

type NotebookTheme =
  | "air"
  | "coffee"
  | "cotton"
  | "deep-space"
  | "glacier"
  | "ink"
  | "midnight"
  | "near-midnight"
  | "ocean-floor"
  | "parchment"
  | "slate"
  | "stark"
  | "sun-faded";

/**
 * Returns the CSS `@import` rules for the given theme. When a `light-dark()`
 * pair is specified, each theme is wrapped in a `prefers-color-scheme` media
 * query so that the appropriate one is applied automatically.
 */
export function themeImports(theme: Notebook["theme"]): string {
  const match = /^light-dark\(([\w-]+),\s*([\w-]+)\)$/.exec(theme.trim().toLowerCase());
  if (match) {
    const [, light, dark] = match;
    return [
      `@import url("observable:styles/theme-${light}.css") (prefers-color-scheme: light);`,
      `@import url("observable:styles/theme-${dark}.css") (prefers-color-scheme: dark);`
    ].join("\n");
  }
  return `@import url("observable:styles/theme-${theme}.css");`;
}

export interface NotebookSpec {
  /** the notebook’s cells, in top-to-bottom document order */
  cells?: CellSpec[];
  /** the notebook title, if any; extracted from the first h1 */
  title?: string;
  /** the notebook theme; defaults to "air"; use `light-dark(light, dark)` for responsive dark mode */
  theme?: NotebookTheme | `light-dark(${NotebookTheme}, ${NotebookTheme})`;
  /** if true, don’t allow editing */
  readOnly?: boolean;
}

export interface Notebook extends NotebookSpec {
  cells: Cell[];
  title: NonNullable<NotebookSpec["title"]>;
  theme: NonNullable<NotebookSpec["theme"]>;
  readOnly: NonNullable<NotebookSpec["readOnly"]>;
}

export interface CellSpec {
  /** the unique identifier for this cell */
  id: number;
  /** the committed cell value; defaults to empty */
  value?: string;
  /** the mode; affects how the value is evaluated; defaults to js */
  mode?: "js" | "ts" | "ojs" | "md" | "html" | "tex" | "dot" | "sql" | "node" | "python" | "r";
  /** if true, the editor will stay open when not focused; defaults to false */
  pinned?: boolean;
  /** if true, implicit display will be suppressed; defaults to false */
  hidden?: boolean;
  /** if present, exposes the cell’s value to the rest of the notebook */
  output?: string;
  /** for data loader cells, how the data is represented */
  format?:
    | "text"
    | "blob"
    | "buffer"
    | "json"
    | "csv"
    | "tsv"
    | "jpeg"
    | "gif"
    | "webp"
    | "png"
    | "arrow"
    | "parquet"
    | "html"
    | "svg"
    | "xml";
  /** for SQL cells, the database to query; use var:<name> to refer to a variable */
  database?: string;
  /** for SQL cells, the oldest allowable age of the cached query result */
  since?: Date | string | number;
}

export interface Cell extends CellSpec {
  value: NonNullable<CellSpec["value"]>;
  mode: NonNullable<CellSpec["mode"]>;
  pinned: NonNullable<CellSpec["pinned"]>;
  hidden: NonNullable<CellSpec["hidden"]>;
  since?: Date;
}

export function toNotebook({
  cells = [],
  title = "Untitled",
  theme = "air",
  readOnly = false
}: NotebookSpec): Notebook {
  return {
    cells: cells.map(toCell),
    title,
    theme,
    readOnly
  };
}

export function toCell({
  id,
  value = "",
  mode = "js",
  pinned = defaultPinned(mode),
  hidden = false,
  output,
  format = isInterpreter(mode) ? "buffer" : undefined,
  database = mode === "sql" ? "var:db" : undefined,
  since
}: CellSpec): Cell {
  return {
    id,
    value,
    mode,
    pinned,
    hidden,
    output,
    format: isInterpreter(mode) ? format : undefined,
    database: mode === "sql" ? database : undefined,
    since: since !== undefined ? asDate(since) : undefined
  };
}

function asDate(date: Date | string | number): Date {
  return date instanceof Date ? date : new Date(date);
}

export function defaultPinned(mode: Cell["mode"]): boolean {
  return mode === "js" || mode === "ts" || mode === "sql" || isInterpreter(mode) || mode === "ojs";
}
