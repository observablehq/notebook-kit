import {tsPlugin} from "@sveltejs/acorn-typescript";
import type {Expression, Literal, Node, Options} from "acorn";
import {Parser} from "acorn";
import type {RecursiveVisitors} from "acorn-walk";
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

const jsxOptions: Options = {
  ecmaVersion: "latest",
  sourceType: "module"
};

export function transformJSX(code: string): string {
  const ast = JsxParser.parse(code, jsxOptions);

  // Rewrite a node's source, replacing any JSX descendants with jsx() calls.
  function compile(node: Node): string {
    if (isElement(node)) return compileElement(node);
    let out = "";
    let pos = node.start;
    for (const root of findRoots(node)) {
      out += code.slice(pos, root.start) + compileElement(root);
      pos = root.end;
    }
    return out + code.slice(pos, node.end);
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

  function compileChild(c: JSXChild): string | null {
    switch (c.type) {
      case "JSXText":
        return compileText(c);
      case "JSXExpressionContainer":
        return c.expression.type === "JSXEmptyExpression" ? null : compile(c.expression);
      case "JSXSpreadChild":
        return compile(c.expression);
      default:
        return compileElement(c);
    }
  }

  function compileAttrValue(v: JSXAttribute["value"]): string {
    if (v == null) return "true";
    if (v.type === "Literal") return JSON.stringify(v.value);
    if (v.type === "JSXExpressionContainer") {
      return v.expression.type === "JSXEmptyExpression" ? "undefined" : compile(v.expression);
    }
    return compileElement(v);
  }

  function compileElement(node: JSXElement | JSXFragment): string {
    let type: string;
    const props: string[] = [];
    let key: string | null = null;
    if (node.type === "JSXFragment") {
      type = `JSX.Fragment`;
    } else {
      const open = node.openingElement;
      type = compileName(open.name);
      for (const attr of open.attributes) {
        if (attr.type === "JSXSpreadAttribute") {
          props.push(`...${compile(attr.argument)}`);
        } else {
          const name =
            attr.name.type === "JSXNamespacedName"
              ? `${attr.name.namespace.name}:${attr.name.name.name}`
              : attr.name.name;
          const value = compileAttrValue(attr.value);
          if (name === "key") key = value;
          else props.push(`${JSON.stringify(name)}: ${value}`);
        }
      }
    }
    const kids = node.children.map(compileChild).filter((c): c is string => c !== null);
    if (kids.length === 1) props.push(`children: ${kids[0]}`);
    else if (kids.length > 1) props.push(`children: [${kids.join(", ")}]`);
    const fn = kids.length > 1 ? "jsxs" : "jsx";
    const args = [type, `{${props.join(", ")}}`];
    if (key !== null) args.push(key);
    return `JSX.${fn}(${args.join(", ")})`;
  }

  return compile(ast);
}
