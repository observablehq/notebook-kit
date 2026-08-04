import type {AnonymousFunctionDeclaration, ArrowFunctionExpression} from "acorn";
import type {BlockStatement, CatchClause, Class} from "acorn";
import type {ForInStatement, ForOfStatement, ForStatement} from "acorn";
import type {FunctionDeclaration, FunctionExpression} from "acorn";
import type {Identifier, Node, Pattern, Program} from "acorn";
import {checkAssignments} from "./assignments.js";
import {defaultGlobals} from "./globals.js";
import {checkExports, isTypeImport} from "./imports.js";
import {ancestor} from "./walk.js";

// Based on https://github.com/ForbesLindesay/acorn-globals
// Portions copyright 2014 Forbes Lindesay.
// https://github.com/ForbesLindesay/acorn-globals/blob/master/LICENSE

type FunctionNode =
  | FunctionExpression // prettier
  | FunctionDeclaration
  | ArrowFunctionExpression
  | AnonymousFunctionDeclaration;

function isScope(node: Node): node is FunctionNode | Program {
  return (
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "Program"
  );
}

// prettier-ignore
function isBlockScope(node: Node): node is FunctionNode | Program | BlockStatement | ForInStatement | ForOfStatement | ForStatement {
  return (
    node.type === "BlockStatement" ||
    node.type === "SwitchStatement" ||
    node.type === "ForInStatement" ||
    node.type === "ForOfStatement" ||
    node.type === "ForStatement" ||
    isScope(node)
  );
}

export function findReferences(
  node: Node,
  {
    input,
    globals = defaultGlobals,
    filterReference = (identifier: Identifier) => !globals.has(identifier.name),
    filterDeclaration = () => true
  }: {
    input?: string;
    globals?: Set<string>;
    filterReference?: (identifier: Identifier) => boolean;
    filterDeclaration?: (identifier: {name: string}) => boolean;
  } = {}
): Identifier[] {
  const locals = new Map<Node, Set<string>>();
  const references: Identifier[] = [];

  function hasLocal(node: Node, name: string): boolean {
    return locals.get(node)?.has(name) ?? false;
  }

  function declareLocal(node: Node, id: {name: string}): void {
    if (!filterDeclaration(id)) return;
    const l = locals.get(node);
    if (l) l.add(id.name);
    else locals.set(node, new Set([id.name]));
  }

  function declareClass(node: Class) {
    if (node.id) declareLocal(node, node.id);
  }

  function declareFunction(node: FunctionNode) {
    node.params.forEach((param) => declarePattern(param, node));
    if (node.id) declareLocal(node, node.id);
    if (node.type !== "ArrowFunctionExpression") declareLocal(node, {name: "arguments"});
  }

  function declareCatchClause(node: CatchClause) {
    if (node.param) declarePattern(node.param, node);
  }

  function declarePattern(node: Pattern, parent: Node) {
    switch (node.type) {
      case "Identifier":
        declareLocal(parent, node);
        break;
      case "ObjectPattern":
        node.properties.forEach((node) =>
          declarePattern(node.type === "Property" ? node.value : node, parent)
        );
        break;
      case "ArrayPattern":
        node.elements.forEach((node) => node && declarePattern(node, parent));
        break;
      case "RestElement":
        declarePattern(node.argument, parent);
        break;
      case "AssignmentPattern":
        declarePattern(node.left, parent);
        break;
    }
  }

  ancestor(node, {
    VariableDeclaration(node, _state, parents) {
      let parent: Node | null = null;
      for (let i = parents.length - 1; i >= 0 && parent === null; --i) {
        if (node.kind === "var" ? isScope(parents[i]) : isBlockScope(parents[i])) {
          parent = parents[i];
        }
      }
      node.declarations.forEach((declaration) => declarePattern(declaration.id, parent!));
    },
    FunctionDeclaration(node, _state, parents) {
      let parent: Node | null = null;
      for (let i = parents.length - 2; i >= 0 && parent === null; --i) {
        if (isScope(parents[i])) {
          parent = parents[i];
        }
      }
      if (node.id) declareLocal(parent!, node.id);
      declareFunction(node);
    },
    FunctionExpression: declareFunction,
    ArrowFunctionExpression: declareFunction,
    ClassDeclaration(node, _state, parents) {
      let parent: Node | null = null;
      for (let i = parents.length - 2; i >= 0 && parent === null; --i) {
        if (isScope(parents[i])) {
          parent = parents[i];
        }
      }
      if (node.id) declareLocal(parent!, node.id);
    },
    ClassExpression: declareClass,
    CatchClause: declareCatchClause,
    ImportDeclaration(node, _state, [root]) {
      if (isTypeImport(node)) return;
      node.specifiers
        .filter((specifier) => !isTypeImport(specifier))
        .forEach((specifier) => declareLocal(root, specifier.local));
    }
  });

  function identifier(node: Identifier, _state: unknown, parents: Node[]) {
    const name = node.name;
    if (name === "undefined") return;
    for (let i = parents.length - 2; i >= 0; --i) {
      if (hasLocal(parents[i], name)) {
        return;
      }
    }
    if (filterReference(node)) {
      references.push(node);
    }
  }

  ancestor(node, {
    Pattern(node, _state, parents) {
      if (node.type === "Identifier") {
        identifier(node, _state, parents);
      }
    },
    Identifier: identifier
  });

  if (input !== undefined) {
    checkAssignments(node, {locals, references, globals, input});
    checkExports(node, {input});
  }

  return references;
}
