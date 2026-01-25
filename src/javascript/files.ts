import type {Identifier, Node} from "acorn";
import {findReferences} from "./references.js";
import {Sourcemap} from "./sourcemap.js";
import {simple} from "./walk.js";

function isFileAttachment({name}: Identifier): boolean {
  return name === "FileAttachment";
}

export function rewriteFileExpressions(output: Sourcemap, body: Node): void {
  const {references} = findReferences(body, {filterReference: isFileAttachment});
  simple(body, {
    CallExpression(node) {
      const {callee} = node;
      if (callee.type !== "Identifier" || !references.includes(callee)) return;
      const args = node.arguments;
      if (args.length === 0) return;
      const [arg] = args;
      output.insertLeft(arg.start, "new URL(");
      output.insertRight(arg.end, ", import.meta.url).href");
    }
  });
}
