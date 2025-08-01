import type {MutableExpression, ViewExpression, Visitors} from "@observablehq/parser";
import {parseCell} from "@observablehq/parser";
import type {BlockStatement, Expression, Identifier, ImportDeclaration} from "acorn";
import {rewriteFileExpressions} from "./files.js";
import {Sourcemap} from "./sourcemap.js";
import type {TranspiledJavaScript, TranspileOptions} from "./transpile.js";
import {transpileJavaScript} from "./transpile.js";
import {simple} from "./walk.js";

export function transpileObservable(
  input: string,
  options?: TranspileOptions
): TranspiledJavaScript {
  const cell = parseCell(input);
  if (!cell.body) return transpileJavaScript(input);
  if (cell.tag) throw new Error("tagged ojs cells are not supported");
  const output = new Sourcemap(input).trim();
  if (cell.body.type === "ImportDeclaration") {
    rewriteImportSource(output, cell.body);
    return transpileJavaScript(String(output));
  }
  if (options?.resolveFiles) rewriteFileExpressions(output, cell.body);
  rewriteSpecialReferences(output, cell.body);
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
    autoview: cell.id?.type === "ViewExpression"
  };
}

function rewriteImportSource(output: Sourcemap, body: ImportDeclaration): void {
  const specifier = body.source.value;
  if (typeof specifier === "string" && !/^\w+:/.test(specifier))
    output.insertLeft(body.source.start + 1, "observable:");
  output.insertRight(body.end, ";");
}

// Rewrite viewof x ↦ viewof$x, and mutable x ↦ mutable$x.value.
function rewriteSpecialReferences(output: Sourcemap, body: Expression | BlockStatement): void {
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
