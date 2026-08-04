import {Token, tokenizer, tokTypes} from "acorn";
import {base, recursive} from "acorn-walk";
import type {JavaScriptCell} from "./parse.js";
import type {Sourcemap} from "./sourcemap.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped acorn-typescript nodes
type AnyNode = any;

// The walk state is the output sourcemap.
type State = Sourcemap;

// A continuation, as used by acorn-walk: recurses into the given node, optionally
// dispatching via an aggregate type (e.g. "Pattern", "Expression").
type Continue = (node: AnyNode, state: State, override?: string) => void;

// An acorn-walk recursive visitor: it is responsible for recursing into the
// node’s value children by invoking the continuation.
type Visitor = (node: AnyNode, state: State, next: Continue) => void;

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

/** Erases TypeScript-specific syntax from output, leaving equivalent JavaScript. */
export function stripTypes(cell: JavaScriptCell, output: Sourcemap): void {
  // The AST is traversed with acorn-walk’s recursive walker. Because acorn-walk’s
  // base visitors only know about (and therefore only recurse into) the value
  // children of each node, type annotations and generics are naturally skipped;
  // we simply delete their source text from the output without descending into
  // them. TypeScript-specific nodes that acorn-walk doesn’t know about (expression
  // wrappers such as `x as T`, type-only declarations, parameter properties) are
  // handled by the dedicated visitors below.
  //
  // Positions are taken from the AST wherever possible. A handful of tokens have
  // no dedicated AST node (modifier keywords, the optional `?` and definite `!`
  // markers), so they are located by re-tokenizing the small, AST-bounded span in
  // which they must occur. Re-tokenizing (rather than string matching) correctly
  // ignores comments and string literals within that span.
  recursive(cell.body, output, visitors);
}

const visitors: Record<string, Visitor> = {
  // Type-only declarations, erased entirely.
  TSTypeAliasDeclaration: deleteStatement,
  TSInterfaceDeclaration: deleteStatement,
  TSDeclareFunction: deleteStatement,
  TSDeclareMethod: deleteStatement,
  TSIndexSignature: deleteStatement,
  TSNamespaceExportDeclaration: deleteStatement,
  // TypeScript expression wrappers, unwrapped to their value expression.
  TSAsExpression: unwrapType, // x as T
  TSSatisfiesExpression: unwrapType, // x satisfies T
  TSNonNullExpression: unwrapType, // x!
  TSInstantiationExpression: unwrapType, // f<T>
  TSTypeAssertion: unwrapAssertion, // <T>x
  TSTypeCastExpression: unwrapCast, // (x: T)
  TSParameterProperty: stripParameterProperty,
  // Standard nodes that may carry type syntax. Function and Class are aggregate
  // types dispatched by acorn-walk’s base walkers, so overriding them covers
  // every function and class form.
  Function: stripFunction,
  Class: stripClass,
  PropertyDefinition: stripMember,
  MethodDefinition: stripMember,
  AccessorProperty: stripMember,
  VariablePattern: stripBindingIdentifier,
  ObjectPattern: stripPattern,
  ArrayPattern: stripPattern,
  RestElement: stripPattern,
  VariableDeclarator: stripVariableDeclarator,
  CallExpression: stripTypeArguments,
  NewExpression: stripTypeArguments,
  TaggedTemplateExpression: stripTypeArguments
};

// Deletes the given node, plus any trailing semicolon and newline.
function deleteStatement(node: AnyNode, output: State): void {
  let end = node.end;
  const input = output.input;
  if (input[end] === ";") ++end;
  if (input[end] === "\n") ++end;
  output.delete(node.start, end);
}

// Unwraps a trailing type wrapper (x as T, x satisfies T, x!, f<T>), keeping the
// value expression.
function unwrapType(node: AnyNode, output: State, next: Continue): void {
  output.delete(node.expression.end, node.end);
  next(node.expression, output);
}

// Unwraps a prefix type assertion (<T>x), keeping the value expression.
function unwrapAssertion(node: AnyNode, output: State, next: Continue): void {
  output.delete(node.start, node.expression.start);
  next(node.expression, output);
}

// Unwraps a parenthesized type cast (x: T), keeping the value expression.
function unwrapCast(node: AnyNode, output: State, next: Continue): void {
  output.delete(node.typeAnnotation.start, node.typeAnnotation.end);
  next(node.expression, output);
}

// Drops accessibility/readonly modifiers from a constructor parameter property,
// keeping the parameter binding. (Note: the implied field assignment is not
// synthesized, so parameter properties are erased but not fully transformed.)
function stripParameterProperty(node: AnyNode, output: State, next: Continue): void {
  deleteModifiers(output, findModifiersStart(node), node.parameter.start);
  next(node.parameter, output, "Pattern");
}

// Removes the return type and generic type parameters from a function.
function stripFunction(node: AnyNode, output: State, next: Continue): void {
  deleteType(output, node, "returnType");
  deleteType(output, node, "typeParameters");
  base.Function!(node, output, next);
}

// Removes generic type parameters, heritage type arguments, the abstract
// modifier, and the implements clause from a class.
function stripClass(node: AnyNode, output: State, next: Continue): void {
  deleteType(output, node, "typeParameters");
  deleteType(output, node, "superTypeParameters");
  deleteType(output, node, "superTypeArguments");
  if (node.abstract && node.id) deleteModifiers(output, findModifiersStart(node), node.id.start);
  if (node.implements?.length) deleteImplements(output, node);
  base.Class!(node, output, next);
}

// Erases abstract/ambient members and overload signatures entirely; otherwise
// removes modifiers, optional/definite markers, and type annotations.
function stripMember(node: AnyNode, output: State, next: Continue): void {
  if (node.abstract || node.declare || node.value?.type === "TSDeclareMethod") return deleteStatement(node, output); // prettier-ignore
  deleteModifiers(output, findModifiersStart(node), node.key.start);
  if (node.optional || node.definite) deleteMarker(output, node.key.end, findMarkerEnd(node));
  deleteType(output, node, "typeParameters");
  deleteType(output, node, "typeAnnotation");
  base.PropertyDefinition!(node, output, next);
}

// Removes the optional marker and type annotation from a binding identifier.
function stripBindingIdentifier(node: AnyNode, output: State): void {
  if (node.optional) deleteMarker(output, node.start, node.typeAnnotation?.start ?? node.end);
  deleteType(output, node, "typeAnnotation");
}

// Removes the type annotation from a destructuring pattern, then recurses.
function stripPattern(node: AnyNode, output: State, next: Continue): void {
  deleteType(output, node, "typeAnnotation");
  base[node.type as "ObjectPattern"]!(node, output, next);
}

// Removes the definite assignment marker from a variable declarator, then
// recurses (the annotation on the binding is handled by the pattern visitor).
function stripVariableDeclarator(node: AnyNode, output: State, next: Continue): void {
  if (node.definite && node.id.type === "Identifier") deleteMarker(output, node.id.start, node.id.typeAnnotation?.start ?? node.init?.start ?? node.id.end); // prettier-ignore
  base.VariableDeclarator!(node, output, next);
}

// Removes generic type arguments from a call, construction, or tagged template
// (e.g. f<T>(), new Map<K, V>()), then recurses.
function stripTypeArguments(node: AnyNode, output: State, next: Continue): void {
  deleteType(output, node, "typeArguments");
  base[node.type as "CallExpression"]!(node, output, next);
}

// Deletes the given child node from the output, if present.
function deleteType(output: State, node: AnyNode, key: string): void {
  const child = node[key];
  if (child) output.delete(child.start, child.end);
}

// The position after any leading decorators, where modifier keywords begin.
function findModifiersStart(node: AnyNode): number {
  const decorators = node.decorators;
  return decorators?.length ? decorators[decorators.length - 1].end : node.start;
}

// The position bounding an optional/definite marker on a class member.
function findMarkerEnd(node: AnyNode): number {
  return node.typeAnnotation?.start ?? node.value?.start ?? node.end;
}

// Deletes the `?` or `!` marker token found between start and end.
function deleteMarker(output: State, start: number, end: number): void {
  forEachToken(output.input, start, end, (t) => {
    if (t.type === tokTypes.question || t.type === tokTypes.prefix) output.delete(t.start, t.end);
  });
}

// Deletes TypeScript-only modifier keyword tokens found between start and end,
// preserving JavaScript keywords such as static, get, set, and async.
function deleteModifiers(output: State, start: number, end: number): void {
  const input = output.input;
  forEachToken(input, start, end, (t) => {
    if (t.type !== tokTypes.name || !MODIFIERS.has((t as Token & {value: string}).value)) return;
    let e = t.end;
    while (input[e] === " " || input[e] === "\t") ++e; // consume trailing space
    output.delete(t.start, e);
  });
}

// Deletes an `implements I, J` heritage clause. The clause spans from the end of
// the preceding heritage node to the end of the last implemented type, so the
// `implements` keyword itself needs no separate lookup.
function deleteImplements(output: State, node: AnyNode): void {
  const list = node.implements;
  const start =
    node.superTypeParameters?.end ??
    node.superTypeArguments?.end ??
    node.superClass?.end ??
    node.id?.end ??
    node.start;
  output.delete(start, list[list.length - 1].end);
}

// Invokes fn for each token in the given span, with absolute offsets. The span is
// re-tokenized with acorn so that comments and strings are handled correctly; any
// tokenizing error (e.g. an unexpected character) is ignored.
function forEachToken(input: string, start: number, end: number, fn: (token: Token) => void): void {
  if (start >= end) return;
  const T = tokenizer(input, {ecmaVersion: "latest"});
  (T as unknown as {pos: number}).pos = start;
  for (const t of T) {
    if (t.type === tokTypes.eof) break;
    if (t.start >= end) break;
    fn(t);
  }
}
