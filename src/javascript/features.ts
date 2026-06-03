import type {Node, CallExpression} from "acorn";
import {getStringLiteralValue, isStringLiteral} from "./literal.js";
import {findReferences} from "./references.js";
import {syntaxError} from "./syntaxError.js";
import {simple} from "./walk.js";

export type FeatureExpression = CallExpression & {argument: string};

/**
 * Returns all calls to the specified feature (e.g., FileAttachment) in the
 * specified body. Throws a SyntaxError if any of the calls are invalid (e.g.,
 * when FileAttachment is passed a dynamic argument).
 */
export function findFeatures(name: string, body: Node, input: string): FeatureExpression[] {
  const filter = (ref: {name: string}) => ref.name === name;
  const references = new Set(findReferences(body, {filterDeclaration: filter, filterReference: filter})); // prettier-ignore
  const calls: FeatureExpression[] = [];

  simple(body, {
    CallExpression(node) {
      const {callee} = node;
      if (callee.type !== "Identifier" || !references.has(callee)) return;
      const [arg] = node.arguments;
      if (!arg || !isStringLiteral(arg)) throw syntaxError(`${name} requires a literal string argument`, node, input); // prettier-ignore
      calls.push(Object.assign(node, {argument: getStringLiteralValue(arg)}));
    }
  });

  return calls;
}
