import type {Node} from "acorn";
import type {Sourcemap} from "./sourcemap.js";
import {getStringLiteralValue, isStringLiteral} from "./strings.js";
import {simple} from "./walk.js";
import {DatabaseConfig} from "../databases/index.js";

export function rewriteDatabaseClient(
  output: Sourcemap,
  body: Node,
  databases: Map<string, Partial<DatabaseConfig>> = new Map()
): void {
  simple(body, {
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || node.callee.name !== "DatabaseClient") return;
      if (!isStringLiteral(node.arguments[0]))
        throw new Error("DatabaseClient name must be a string literal");

      // if options are passed, don't change them
      if (node.arguments.length !== 1) return;

      const name = getStringLiteralValue(node.arguments[0]);
      let type: string | undefined;
      if (databases.has(name)) {
        ({type} = databases.get(name)!);
      } else {
        // see defaults in databases/index.ts ; @todo: unify?
        if (name === "postgres") type = "postgres";
        else if (name === "duckdb") type = "duckdb";
        else if (name === "sqlite") type = "sqlite";
        else if (/\.duckdb$/i.test(name)) type = "duckdb";
        else if (/\.db$/i.test(name)) type = "sqlite";
        else throw new Error(`database not found: ${name}`);
      }
      output.insertRight(node.arguments[0].end, `, {type: ${JSON.stringify(type)}}`);
    }
  });
}
