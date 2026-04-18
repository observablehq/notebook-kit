import {isInterpreter} from "./interpreters.js";

export type NotebookTheme =
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
 * Whether each theme renders in a light or dark color scheme. Themes not
 * listed here are treated as modifiers and applied regardless of scheme.
 */
export const themeScheme: Partial<Record<NotebookTheme, "light" | "dark">> = {
  "air": "light",
  "coffee": "dark",
  "cotton": "light",
  "deep-space": "dark",
  "glacier": "light",
  "ink": "dark",
  "midnight": "dark",
  "near-midnight": "dark",
  "ocean-floor": "dark",
  "parchment": "light",
  "slate": "dark",
  "stark": "dark",
  "sun-faded": "dark"
};

/**
 * Returns the CSS `@import` rules for the given theme(s). When a light theme
 * and a dark theme are combined, each is wrapped in a `prefers-color-scheme`
 * media query so that the appropriate one is applied automatically.
 */
export function themeImports(theme: NotebookTheme | NotebookTheme[]): string {
  const themes = Array.isArray(theme) ? theme : [theme];
  const hasLight = themes.some((t) => themeScheme[t] === "light");
  const hasDark = themes.some((t) => themeScheme[t] === "dark");
  return themes
    .map((t) => {
      const scheme = themeScheme[t];
      const media =
        scheme === "dark" && hasLight
          ? " (prefers-color-scheme: dark)"
          : scheme === "light" && hasDark
            ? " (prefers-color-scheme: light)"
            : "";
      return `@import url("observable:styles/theme-${t}.css")${media};`;
    })
    .join("\n");
}

export interface NotebookSpec {
  /** the notebook’s cells, in top-to-bottom document order */
  cells?: CellSpec[];
  /** the notebook title, if any; extracted from the first h1 */
  title?: string;
  /**
   * the notebook theme; defaults to "air". Passing multiple themes enables
   * automatic dark mode: when a light theme and a dark theme are combined,
   * each is applied selectively based on the user’s `prefers-color-scheme`.
   */
  theme?: NotebookTheme | NotebookTheme[];
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
