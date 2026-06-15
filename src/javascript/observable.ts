import type {Cell, ImportCell, Visitors} from "@observablehq/parser";
import type {MutableExpression, ViewExpression} from "@observablehq/parser";
import {parseCell} from "@observablehq/parser";
import type {Identifier, ImportDeclaration, Node} from "acorn";
import {rewriteFileExpressions} from "./files.js";
import {flatMapImportSpecifiers, rewriteImportDeclarations} from "./imports.js";
import {resolveNpmImport} from "./imports/npm.js";
import {Sourcemap} from "./sourcemap.js";
import {getStringLiteralValue, isStringLiteral} from "./strings.js";
import type {TranspiledJavaScript, TranspileOptions} from "./transpile.js";
import {transpileJavaScript} from "./transpile.js";
import {simple} from "./walk.js";

export function transpileObservable(
  input: string,
  options?: TranspileOptions
): TranspiledJavaScript {
  const cell = parseCell(input);
  if (!cell.body) return transpileJavaScript(input);
  if (isImportCell(cell)) return transpileObservableImport(input, cell, options);
  if (cell.tag) throw new Error("tagged ojs cells are not supported");
  const output = new Sourcemap(input).trim();
  rewriteSpecialReferences(output, cell.body);
  rewriteDynamicImports(output, cell.body);
  if (options?.resolveFiles) rewriteFileExpressions(output, cell.body);
  const inputs = Array.from(new Set(cell.references.map(asReference)));
  let start = "";
  let end = "";
  start += `${cell.async ? "async " : ""}function${cell.generator ? "*" : ""}`;
  if (cell.id) start += ` ${asReference(cell.id)}`;
  start += `(${inputs})`;
  if (cell.body.type !== "BlockStatement") {
    start += "{return(";
    end += ")}";
  }
  output.replaceLeft(0, cell.body.start, `${start}\n`);
  output.replaceRight(cell.body.end, input.length, `\n${end}`);
  return {
    body: String(output),
    inputs,
    output: cell.id ? asDeclaration(cell.id) : undefined,
    autodisplay: true,
    automutable: cell.id?.type === "MutableExpression",
    autoview: cell.id?.type === "ViewExpression",
    files: new Set(cell.fileAttachments.keys()),
    databases: new Set(cell.databaseClients.keys()),
    secrets: new Set(cell.secrets.keys())
  };
}

function isImportCell(cell: Cell): cell is ImportCell {
  return cell.body.type === "ImportDeclaration";
}

function transpileObservableImport(
  input: string,
  cell: ImportCell,
  options?: TranspileOptions
): TranspiledJavaScript {
  const output = new Sourcemap(input).trim();
  const inputs = ["@variable"];
  const declarations: Identifier[] = flatMapImportSpecifiers(cell.body, (s) => s.local);
  const outputs = Array.from(new Set(declarations.map(asDeclaration)));
  transformObservableImport(cell.body);
  rewriteImportDeclarations(output, cell.body, inputs, options);
  output.insertLeft(0, `async (__variable) => {\n`);
  if (outputs.length > 0) output.insertRight(input.length, `\nreturn {${outputs}};`);
  output.insertRight(input.length, "\n}");
  const body = String(output);
  return {
    body,
    inputs,
    outputs,
    autodisplay: false,
    files: new Set(),
    secrets: new Set(),
    databases: new Set()
  };
}

/** Mutates the given import declaration to be an Observable import. */
function transformObservableImport(body: ImportDeclaration): void {
  const source = body.source.value;
  if (typeof source === "string" && !/^\w+:/.test(source)) {
    body.source.value = `observable:${source}`;
  }
  body.attributes = [
    {
      type: "ImportAttribute",
      key: {type: "Literal", value: "type", start: 0, end: 0},
      value: {type: "Literal", value: "observable", start: 0, end: 0},
      start: 0,
      end: 0
    }
  ];
}

/**
 * Rewrite a bare dynamic import such as import("d3") to a CDN URL, like
 * import("https://cdn.jsdelivr.net/npm/d3/+esm"), using the same resolution as
 * static imports. Protocol (npm:, https:, …) and local imports are left alone.
 */
function rewriteDynamicImports(output: Sourcemap, body: Node): void {
  simple(body, {
    ImportExpression({source}) {
      if (!isStringLiteral(source)) return;
      const value = getStringLiteralValue(source);
      if (/^(\w+:|\.?\.?\/)/.test(value)) return;
      const resolution = resolveNpmImport(`npm:${value}`);
      output.replaceLeft(source.start, source.end, JSON.stringify(resolution));
    }
  });
}

/** Rewrite viewof x ↦ viewof$x, and mutable x ↦ mutable$x.value. */
function rewriteSpecialReferences(output: Sourcemap, body: Node): void {
  simple(body, {
    MutableExpression(node) {
      output.replaceLeft(node.start, node.end, `${asReference(node)}.value`);
    },
    ViewExpression(node) {
      output.replaceLeft(node.start, node.end, asReference(node));
    }
  } as Visitors);
}

function asReference(ref: Identifier | ViewExpression | MutableExpression): string {
  return ref.type === "ViewExpression"
    ? `viewof$${ref.id.name}`
    : ref.type === "MutableExpression"
      ? `mutable$${ref.id.name}`
      : ref.name;
}

function asDeclaration(ref: Identifier | ViewExpression | MutableExpression): string {
  return ref.type === "ViewExpression"
    ? `viewof$${ref.id.name}`
    : ref.type === "MutableExpression"
      ? `mutable ${ref.id.name}` // "initial x", really
      : ref.name;
}
