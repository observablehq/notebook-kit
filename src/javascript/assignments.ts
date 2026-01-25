import type {Expression, Identifier, Node, Pattern, VariableDeclaration} from "acorn";
import {syntaxError} from "./syntaxError.js";
import {ancestor} from "./walk.js";

type Assignable = Expression | Pattern | VariableDeclaration;

export function checkAssignments(
  node: Node,
  {
    input,
    locals,
    references,
    globals
  }: {
    input: string;
    locals: Map<Node, Set<string>>;
    references: Identifier[];
    globals: Set<string>;
  }
): void {
  function isLocal({name}: Identifier, parents: Node[]): boolean {
    for (const p of parents) if (locals.get(p)?.has(name)) return true;
    return false;
  }

  function checkConst(node: Assignable, parents: Node[]) {
    switch (node.type) {
      case "Identifier":
        if (isLocal(node, parents)) break;
        if (references.includes(node))
          throw syntaxError(`Assignment to external variable '${node.name}'`, node, input);
        if (globals.has(node.name))
          throw syntaxError(`Assignment to global '${node.name}'`, node, input);
        break;
      case "ArrayPattern":
        for (const e of node.elements) if (e) checkConst(e, parents);
        break;
      case "ObjectPattern":
        for (const p of node.properties) checkConst(p.type === "Property" ? p.value : p, parents);
        break;
      case "RestElement":
        checkConst(node.argument, parents);
        break;
    }
  }

  function checkConstArgument({argument}: {argument: Assignable}, parents: Node[]) {
    checkConst(argument, parents);
  }

  function checkConstLeft({left}: {left: Assignable}, parents: Node[]) {
    checkConst(left, parents);
  }

  ancestor(node, {
    AssignmentExpression: checkConstLeft,
    AssignmentPattern: checkConstLeft,
    UpdateExpression: checkConstArgument,
    ForOfStatement: checkConstLeft,
    ForInStatement: checkConstLeft
  });
}
