import {tokenizer} from "acorn";
import type {JavaScriptCell} from "./parse.js";
import type {Sourcemap} from "./sourcemap.js";

// Whole statements or class members that carry no runtime value; erased entirely.
const TYPE_STATEMENTS = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSDeclareFunction",
  "TSDeclareMethod",
  "TSIndexSignature",
  "TSNamespaceExportDeclaration"
]);

// Node properties that hold pure type information (annotations and generics).
const TYPE_PROPERTIES = [
  "typeAnnotation", // x: T
  "returnType", // (): T
  "typeParameters", // f<T>() {}
  "typeArguments", // f<T>()
  "superTypeParameters", // extends B<T>
  "superTypeArguments" // extends B<T> (alternate name)
];

// TypeScript-only modifier keywords; static/get/set/async are valid JavaScript
// and so are deliberately excluded (and preserved).
const MODIFIERS = new Set([
  "public",
  "private",
  "protected",
  "readonly",
  "override",
  "declare",
  "abstract"
]);

/**
 * Erases TypeScript-specific syntax from output, leaving equivalent JavaScript.
 *
 * Positions are taken from the AST wherever possible. A handful of tokens have
 * no dedicated AST node (modifier keywords, the optional `?` and definite `!`
 * markers), so they are located by re-tokenizing the small, AST-bounded span in
 * which they must occur. Re-tokenizing (rather than string matching) correctly
 * ignores comments and string literals within that span.
 */
export function stripTypes(cell: JavaScriptCell, output: Sourcemap): void {
  const input = output.input;
  strip(cell.body);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped acorn-typescript nodes
  function strip(node: any): void {
    if (!node || typeof node.type !== "string") return;

    // Erase entire type-only declarations (type aliases, interfaces, etc.).
    if (TYPE_STATEMENTS.has(node.type)) return deleteStatement(node.start, node.end);

    switch (node.type) {
      // Unwrap TypeScript expression wrappers, keeping the value expression.
      case "TSAsExpression": // x as T
      case "TSSatisfiesExpression": // x satisfies T
      case "TSNonNullExpression": // x!
      case "TSInstantiationExpression": // f<T>
        output.delete(node.expression.end, node.end);
        return strip(node.expression);
      case "TSTypeAssertion": // <T>x
        output.delete(node.start, node.expression.start);
        return strip(node.expression);
      case "TSTypeCastExpression": // (x: T)
        output.delete(node.typeAnnotation.start, node.typeAnnotation.end);
        return strip(node.expression);
      // Drop accessibility/readonly modifiers from constructor parameter
      // properties, keeping the parameter binding. (Note: the implied field
      // assignment is not synthesized, so parameter properties are erased but
      // not fully transformed.)
      case "TSParameterProperty":
        deleteModifiers(modifiersStart(node), node.parameter.start);
        return strip(node.parameter);
    }

    const member =
      node.type === "PropertyDefinition" ||
      node.type === "MethodDefinition" ||
      node.type === "AccessorProperty";

    // Erase abstract/ambient members and overload signatures (which have no
    // implementation) entirely.
    if (member && (node.abstract || node.declare || node.value?.type === "TSDeclareMethod")) {
      return deleteStatement(node.start, node.end);
    }

    // Remove modifiers, heritage, and optional/definite markers.
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
      if (node.abstract && node.id) deleteModifiers(modifiersStart(node), node.id.start);
      if (node.implements?.length) deleteImplements(node);
    } else if (member) {
      deleteModifiers(modifiersStart(node), node.key.start);
      if (node.optional || node.definite) deleteMarker(node.key.end, markerEnd(node));
    } else if (node.type === "Identifier" && node.optional) {
      deleteMarker(node.start, node.typeAnnotation?.start ?? node.end);
    } else if (
      node.type === "VariableDeclarator" &&
      node.definite &&
      node.id.type === "Identifier"
    ) {
      deleteMarker(node.id.start, node.id.typeAnnotation?.start ?? node.init?.start ?? node.id.end);
    }

    // Remove type annotations and generics attached to this node.
    for (const key of TYPE_PROPERTIES) {
      const child = node[key];
      if (child && typeof child.type === "string") output.delete(child.start, child.end);
    }

    // Recurse into the remaining (value) children.
    for (const key in node) {
      if (key === "implements" || TYPE_PROPERTIES.includes(key)) continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(strip);
      else if (child && typeof child === "object" && typeof child.type === "string") strip(child);
    }
  }

  // The position after any leading decorators, where modifier keywords begin.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped acorn-typescript nodes
  function modifiersStart(node: any): number {
    const decorators = node.decorators;
    return decorators?.length ? decorators[decorators.length - 1].end : node.start;
  }

  // The position bounding an optional/definite marker on a class member.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped acorn-typescript nodes
  function markerEnd(node: any): number {
    return node.typeAnnotation?.start ?? node.value?.start ?? node.end;
  }

  // Deletes a node range plus any trailing semicolon and newline.
  function deleteStatement(start: number, end: number): void {
    if (input[end] === ";") ++end;
    if (input[end] === "\n") ++end;
    output.delete(start, end);
  }

  // Deletes the `?` or `!` marker token found between start and end.
  function deleteMarker(start: number, end: number): void {
    eachToken(start, end, (t) => {
      if (t.text === "?" || t.text === "!") output.delete(t.start, t.end);
    });
  }

  // Deletes TypeScript-only modifier keyword tokens found between start and end,
  // preserving JavaScript keywords such as static, get, set, and async.
  function deleteModifiers(start: number, end: number): void {
    eachToken(start, end, (t) => {
      if (!MODIFIERS.has(t.text)) return;
      let e = t.end;
      while (input[e] === " " || input[e] === "\t") ++e; // consume trailing space
      output.delete(t.start, e);
    });
  }

  // Deletes an `implements I, J` heritage clause. The clause spans from the end
  // of the preceding heritage node to the end of the last implemented type, so
  // the `implements` keyword itself needs no separate lookup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped acorn-typescript nodes
  function deleteImplements(node: any): void {
    const list = node.implements;
    const start =
      node.superTypeParameters?.end ??
      node.superTypeArguments?.end ??
      node.superClass?.end ??
      node.id?.end ??
      node.start;
    output.delete(start, list[list.length - 1].end);
  }

  // Invokes fn for each token in the given span, with absolute offsets. The span
  // is re-tokenized with acorn so that comments and strings are handled
  // correctly; any tokenizing error (e.g. an unexpected character) is ignored.
  function eachToken(
    start: number,
    end: number,
    fn: (token: {text: string; start: number; end: number}) => void
  ): void {
    if (start >= end) return;
    const code = input.slice(start, end);
    try {
      for (const t of tokenizer(code, {ecmaVersion: "latest"})) {
        if (t.type.label === "eof") break;
        fn({text: code.slice(t.start, t.end), start: start + t.start, end: start + t.end});
      }
    } catch {
      // Ignore: the span could not be tokenized in isolation.
    }
  }
}
