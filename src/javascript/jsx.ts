import {tsPlugin} from "@sveltejs/acorn-typescript";
import type {Expression, Literal, Node} from "acorn";
import {Parser} from "acorn";
import type {RecursiveVisitors} from "acorn-walk";
import {Sourcemap} from "./sourcemap.js";
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

function isElement(node: Node): node is JSXElement | JSXFragment {
  return node.type === "JSXElement" || node.type === "JSXFragment";
}

// Returns the outermost JSX nodes within the given node, in source order.
function findRoots(node: Node): (JSXElement | JSXFragment)[] {
  const roots: (JSXElement | JSXFragment)[] = [];
  const push = (node: JSXElement | JSXFragment) => void roots.push(node);
  recursive(node, null, {JSXElement: push, JSXFragment: push} as RecursiveVisitors<unknown>);
  return roots.sort((a, b) => a.start - b.start);
}

export const JsxParser = Parser.extend(tsPlugin({jsx: true}));

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

// Any generated code that immediately precedes the element (such as a comma
// separating it from an adjacent element) is passed as a prefix, since it can’t
// be part of a replaced range of JSX syntax.
function rewriteElement(node: JSXElement | JSXFragment, output: Sourcemap, prefix = ""): void {
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
        const name =
          attr.name.type === "JSXNamespacedName"
            ? `${attr.name.namespace.name}:${attr.name.name.name}`
            : attr.name.name;
        if (name === "key") key = compileKey(attr.value, output);
        else props.push([`${JSON.stringify(name)}: `, compileAttributeValue(attr.value)]);
      }
    }
  }
  // Spread children are passed as an array (or spread into one); like multiple
  // children, the array is static, so it is passed to jsxs rather than jsx.
  const children = node.children.flatMap((c) => {
    const part = compileChild(c);
    return part === null ? [] : [{part, spread: c.type === "JSXSpreadChild"}];
  });
  const isStatic = children.length > 1 || children.some((c) => c.spread);
  if (children.length === 1) props.push(["children: ", children[0].part]);
  else if (children.length > 1) props.push(["children: [", ...join(children.map((c) => (c.spread ? ["...", c.part] : [c.part]))).flat(), "]"]); // prettier-ignore
  emit(
    node,
    [
      `${prefix}JSX.${isStatic ? "jsxs" : "jsx"}(${type}, {`,
      ...join(props).flat(),
      key === null ? "})" : `}, ${key})`
    ],
    output
  );
}

// Replaces the source of the given element with the given parts, replacing the
// source between preserved nodes with the generated code.
function emit(node: Node, parts: Part[], output: Sourcemap): void {
  let index = node.start;
  let code = "";
  for (const part of parts) {
    if (typeof part === "string") {
      code += part;
      continue;
    }
    if (index < part.start) {
      output.replaceLeft(index, part.start, code);
      code = "";
    }
    if (isElement(part)) {
      rewriteElement(part, output, code);
    } else {
      if (code) output.insertLeft(part.start, code);
      rewriteJSX(part, output);
    }
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
      return JSON.stringify(`${n.namespace.name}:${n.name.name}`);
  }
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

function compileChild(c: JSXChild): Part | null {
  switch (c.type) {
    case "JSXText":
      return compileText(c);
    case "JSXExpressionContainer":
      return c.expression.type === "JSXEmptyExpression" ? null : c.expression;
    case "JSXSpreadChild":
      return c.expression;
    default:
      return c;
  }
}

function compileAttributeValue(v: JSXAttribute["value"]): Part {
  if (v == null) return "true";
  if (v.type === "Literal") return JSON.stringify(v.value);
  if (v.type === "JSXExpressionContainer") return v.expression.type === "JSXEmptyExpression" ? "undefined" : v.expression; // prettier-ignore
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
