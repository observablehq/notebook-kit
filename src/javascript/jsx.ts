import type {Expression, Literal, Node} from "acorn";
import type {RecursiveVisitors} from "acorn-walk";
import type {Sourcemap} from "./sourcemap.js";
import {syntaxError} from "./syntaxError.js";
import {recursive} from "./walk.js";

interface JSXIdentifier extends Node {
  type: "JSXIdentifier";
  name: string;
}

interface JSXNamespacedName extends Node {
  type: "JSXNamespacedName";
  namespace: JSXIdentifier;
  name: JSXIdentifier;
}

interface JSXMemberExpression extends Node {
  type: "JSXMemberExpression";
  object: JSXMemberExpression | JSXIdentifier;
  property: JSXIdentifier;
}

type JSXElementName = JSXIdentifier | JSXNamespacedName | JSXMemberExpression;

interface JSXEmptyExpression extends Node {
  type: "JSXEmptyExpression";
}

interface JSXExpressionContainer extends Node {
  type: "JSXExpressionContainer";
  expression: Expression | JSXEmptyExpression;
}

interface JSXSpreadChild extends Node {
  type: "JSXSpreadChild";
  expression: Expression;
}

interface JSXText extends Node {
  type: "JSXText";
  value: string;
  raw: string;
}

interface JSXAttribute extends Node {
  type: "JSXAttribute";
  name: JSXIdentifier | JSXNamespacedName;
  value: Literal | JSXExpressionContainer | JSXElement | JSXFragment | null;
}

interface JSXSpreadAttribute extends Node {
  type: "JSXSpreadAttribute";
  argument: Expression;
}

interface JSXOpeningElement extends Node {
  type: "JSXOpeningElement";
  name: JSXElementName;
  attributes: (JSXAttribute | JSXSpreadAttribute)[];
  selfClosing: boolean;
}

interface JSXClosingElement extends Node {
  type: "JSXClosingElement";
  name: JSXElementName;
}

interface JSXOpeningFragment extends Node {
  type: "JSXOpeningFragment";
}

interface JSXClosingFragment extends Node {
  type: "JSXClosingFragment";
}

type JSXChild = JSXText | JSXExpressionContainer | JSXSpreadChild | JSXElement | JSXFragment;

interface JSXElement extends Node {
  type: "JSXElement";
  openingElement: JSXOpeningElement;
  closingElement: JSXClosingElement | null;
  children: JSXChild[];
}

interface JSXFragment extends Node {
  type: "JSXFragment";
  openingFragment: JSXOpeningFragment;
  closingFragment: JSXClosingFragment;
  children: JSXChild[];
}

/**
 * Returns true if the given tag name (such as div or my-element) refers to an
 * intrinsic element, compiled as a string, rather than a variable reference.
 * This applies only to simple tag names, not to the root of a member
 * expression (such as foo in foo.Bar), which is always a reference.
 */
export function isIntrinsicName(name: string): boolean {
  return /^[a-z]/.test(name) || name.includes("-");
}

// Returns the outermost JSX nodes within the given node, in source order.
function findRoots(node: Node): (JSXElement | JSXFragment)[] {
  const roots: (JSXElement | JSXFragment)[] = [];
  const push = (node: JSXElement | JSXFragment) => void roots.push(node);
  recursive(node, null, {JSXElement: push, JSXFragment: push} as RecursiveVisitors<unknown>);
  return roots;
}

/**
 * Rewrites any JSX within the given node as calls to JSX.jsx or JSX.jsxs, in
 * place. Only JSX syntax is replaced; the source of embedded expressions (such
 * as attribute values and children) is preserved, along with any existing
 * edits within them, such as erased TypeScript.
 */
export function rewriteJSX(node: Node, output: Sourcemap): void {
  for (const root of findRoots(node)) rewriteElement(root, output);
}

// A part of a compiled element: either generated code, or a node whose source
// is preserved (an expression, or a nested element that is itself rewritten).
type Part = string | Node;

// Rewrites the given element or fragment, such as <Foo a={x}>b</Foo>, as a call
// such as JSX.jsx(Foo, {"a": x, children: "b"}), along with any nested JSX.
function rewriteElement(node: JSXElement | JSXFragment, output: Sourcemap): void {
  // Compute the type and props from the tag name and attributes. Each prop is a
  // list of parts, such as ['"a": ', x] for a={x}, where x is preserved. The
  // key isn’t a prop; it’s passed separately as the last argument.
  let type = "JSX.Fragment";
  let key: string | null = null;
  const props: Part[][] = [];
  if (node.type === "JSXElement") {
    const open = node.openingElement;
    type = compileName(open.name);
    for (const attr of open.attributes) {
      if (attr.type === "JSXSpreadAttribute") {
        props.push(["...", attr.argument]);
      } else {
        const name = jsxName(attr.name);
        if (name === "key") key = compileKey(attr.value, output);
        else props.push([`${JSON.stringify(name)}: `, compileAttributeValue(attr.value)]);
      }
    }
  }

  // Compute the children prop. Text becomes a string literal (or is dropped if
  // only whitespace); expressions and nested elements are preserved. A single
  // child is passed directly; multiple children are passed as an array, which
  // React expects via jsxs rather than jsx (so it doesn’t warn about keys).
  const children = node.children.map((c) => compileChild(c, output)).filter((c): c is Part => c !== null); // prettier-ignore
  const mulipleChildren = children.length > 1;
  if (children.length === 1) props.push(["children: ", children[0]]);
  else if (mulipleChildren) props.push(["children: [", ...join(children), "]"]);

  // Construct the jsx (or jsxs) call and argument parts. For <Foo
  // a={x}>b</Foo>, this is (with adjacent strings combined) ['JSX.jsx(Foo,
  // {"a": ', x, ', children: "b"})'].
  const parts = [
    `JSX.${mulipleChildren ? "jsxs" : "jsx"}(${type}, {`,
    ...join(props).flat(),
    key === null ? "})" : `}, ${key})`
  ];

  // Rewrite the output: the source between preserved nodes (the JSX syntax,
  // such as <Foo a={ and }>b</Foo>) is replaced with the generated code, and
  // each preserved node is rewritten recursively.
  let index = node.start;
  let code = "";
  for (const part of parts) {
    if (typeof part === "string") {
      code += part;
      continue;
    }
    // Rewrite the part first, so that any code inserted before it (such as a
    // comma separating adjacent elements) precedes any edits at its start.
    rewriteJSX(part, output);
    if (index < part.start || code) output.replaceLeft(index, part.start, code);
    index = part.end;
    code = "";
  }
  output.replaceLeft(index, node.end, code);
}

function join<T>(parts: T[]): (T | ", ")[] {
  return parts.flatMap((part, i) => (i > 0 ? [", " as const, part] : [part]));
}

function compileName(n: JSXElementName): string {
  switch (n.type) {
    case "JSXIdentifier":
      return isIntrinsicName(n.name) ? JSON.stringify(n.name) : n.name;
    case "JSXMemberExpression":
      return `${n.object.type === "JSXIdentifier" ? n.object.name : compileName(n.object)}.${n.property.name}`;
    case "JSXNamespacedName":
      return JSON.stringify(jsxName(n));
  }
}

// Returns the name of a tag or attribute, such as div or svg:rect.
function jsxName(n: JSXIdentifier | JSXNamespacedName): string {
  return n.type === "JSXNamespacedName" ? `${n.namespace.name}:${n.name.name}` : n.name;
}

function compileText(c: JSXText): string | null {
  const lines = c.value.split(/\r\n|\n|\r/);
  const parts: string[] = [];
  lines.forEach((line, i) => {
    if (i !== 0) line = line.replace(/^[ \t]+/, "");
    if (i !== lines.length - 1) line = line.replace(/[ \t]+$/, "");
    if (line) parts.push(line);
  });
  const text = parts.join(" ");
  return text ? JSON.stringify(text) : null;
}

function compileChild(c: JSXChild, output: Sourcemap): Part | null {
  switch (c.type) {
    case "JSXText":
      return compileText(c);
    case "JSXExpressionContainer":
      return c.expression.type === "JSXEmptyExpression" ? null : c.expression;
    case "JSXSpreadChild": // {...xs}; not supported by React (and rejected by Babel)
      throw syntaxError("Spread children are not supported", c, output.input);
    default:
      return c;
  }
}

function compileAttributeValue(v: JSXAttribute["value"]): Part {
  if (v == null) return "true";
  if (v.type === "Literal") return JSON.stringify(v.value);
  if (v.type === "JSXExpressionContainer") return v.expression; // can’t be empty in an attribute
  return v;
}

// The key is passed as the last argument, after the props, so unlike other
// attribute values its source can’t be preserved in place; instead it is copied
// (including any edits, such as nested JSX or erased types).
function compileKey(v: JSXAttribute["value"], output: Sourcemap): string {
  const value = compileAttributeValue(v);
  if (typeof value === "string") return value;
  rewriteJSX(value, output);
  return output.slice(value.start, value.end);
}
