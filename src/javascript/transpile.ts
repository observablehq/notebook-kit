import type {Cell} from "../lib/notebook.js";
import {toCell} from "../lib/notebook.js";
import {rewriteFileExpressions} from "./files.js";
import {hasImportDeclaration} from "./imports.js";
import {rewriteImportDeclarations, rewriteImportExpressions} from "./imports.js";
import {transpileObservable} from "./observable.js";
import {parseJavaScript} from "./parse.js";
import {Sourcemap} from "./sourcemap.js";
import {transpileTemplate} from "./template.js";
import {transpileTypeScript} from "./typescript.js";

export type TranspiledJavaScript = {
  /** the source code of a JavaScript function defining the primary variable */
  body: string;
  /** any unbound references in body; corresponds to the body arguments, in order */
  inputs?: string[];
  /** if present, the body returns an object of named outputs; alternative to output */
  outputs?: string[];
  /** if present, the body returns a single named output; alternative to outputs */
  output?: string;
  /** whether to implicitly display the body value (e.g., an expression) */
  autodisplay?: boolean;
  /** whether to implicitly derive a view; requires viewof output */
  autoview?: boolean;
  /** whether to implicitly derive a mutable; requires mutable output */
  automutable?: boolean;
  /** the names of any referenced files */
  files?: Set<string>;
  /** the names of any referenced databases */
  databases?: Set<string>;
  /** the names of any referenced secrets */
  secrets?: Set<string>;
};

export type TranspileOptions = {
  /** If true, resolve local imports paths relative to document.baseURI. */
  resolveLocalImports?: boolean;
  /** If true, resolve file using import.meta.url (so Vite treats it as an asset). */
  resolveFiles?: boolean;
};

/** @deprecated */
export function transpile(
  input: string,
  mode: Cell["mode"],
  options?: TranspileOptions
): TranspiledJavaScript;
export function transpile(input: Cell, options?: TranspileOptions): TranspiledJavaScript;
export function transpile(
  input: string | Cell,
  mode?: Cell["mode"] | TranspileOptions,
  options?: TranspileOptions
): TranspiledJavaScript {
  let cell: Cell;
  if (typeof input === "string") {
    mode = mode as Cell["mode"];
    cell = toCell({id: -1, value: input, mode});
  } else {
    options = mode as TranspileOptions | undefined;
    mode = input.mode;
    cell = input;
    input = cell.value;
  }
  const transpiled =
    mode === "ts"
      ? transpileJavaScript(transpileTypeScript(input), options)
      : mode === "ojs"
        ? transpileObservable(input, options)
        : mode !== "js"
          ? transpileJavaScript(transpileTemplate(cell), options)
          : transpileJavaScript(input, options);
  if (transpiled.output === undefined) transpiled.output = cell.output;
  if (cell.hidden) transpiled.autodisplay = false;
  else if (mode !== "js" && mode !== "ts" && mode !== "ojs") {
    transpiled.autodisplay = !!input;
    transpiled.autoview = mode === "sql" && transpiled.autodisplay && !!transpiled.output;
    if (transpiled.autoview) transpiled.output = `viewof$${transpiled.output}`;
  }
  return transpiled;
}

export function transpileJavaScript(
  input: string,
  options?: TranspileOptions
): TranspiledJavaScript {
  const cell = parseJavaScript(input);
  let async = cell.async;
  const inputs = Array.from(new Set(cell.references.map((r) => r.name)));
  if (hasImportDeclaration(cell.body)) async = true;
  const outputs = Array.from(new Set(cell.declarations?.map((r) => r.name)));
  const output = new Sourcemap(input).trim();
  rewriteImportDeclarations(output, cell.body, inputs, options);
  rewriteImportExpressions(output, cell.body, options);
  if (options?.resolveFiles) rewriteFileExpressions(output, cell.body);
  if (cell.expression) output.insertLeft(0, `return (\n`);
  output.insertLeft(0, `${async ? "async " : ""}(${inputs.map(deat)}) => {\n`);
  if (outputs.length > 0) output.insertRight(input.length, `\nreturn {${outputs}};`);
  if (cell.expression) output.insertRight(input.length, `\n)`);
  output.insertRight(input.length, "\n}");
  const body = String(output);
  const autodisplay = cell.expression && !(inputs.includes("display") || inputs.includes("view"));
  const files = new Set(cell.files.map((f) => f.argument));
  const databases = new Set(cell.databases.map((f) => f.argument));
  const secrets = new Set(cell.secrets.map((f) => f.argument));
  return {body, inputs, outputs, autodisplay, files, databases, secrets};
}

export function deat(input: string): string {
  return input.replace(/^@/, "__"); // @variable to __variable
}
