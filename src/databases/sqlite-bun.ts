import type {Statement} from "bun:sqlite";
import {Database} from "bun:sqlite";
import type {QueryTemplateFunction} from "./index.js";
import type {ColumnSchema} from "../runtime/index.js";
import type {SQLiteConfig} from "./sqlite.js";
import {getColumnType} from "./sqlite.js";

export default function sqlite({path = ":memory:"}: SQLiteConfig): QueryTemplateFunction {
  return async (strings, ...params) => {
    const date = new Date();
    const database = new Database(path);
    try {
      const statement = database.prepare(strings.join("?"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = statement.all(...(params as any[])) as Record<string, unknown>[];
      return {
        rows,
        schema: getStatementSchema(statement),
        duration: Date.now() - +date,
        date
      };
    } finally {
      database.close();
    }
  };
}

function getStatementSchema(statement: Statement): ColumnSchema[] {
  return statement.columnNames.map((name, i) => ({
    name,
    type: getColumnType(statement.columnTypes[i])
  }));
}
