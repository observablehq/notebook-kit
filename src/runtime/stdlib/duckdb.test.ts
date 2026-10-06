import {assert, test, vi} from "vitest";
import {sql} from "./sql.js";

vi.mock("https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm", () => ({
  selectBundle: () => new Promise(() => {}),
  ConsoleLogger: class {},
  LogLevel: {}
}));

const {DuckDBClient} = await import("./duckdb.js");

test("DuckDBClient.sql flattens SQL fragments", async () => {
  const queries: [string, unknown[]][] = [];
  const db = Object.create(DuckDBClient.prototype, {query: {value: async (query: string, params: unknown[]) => queries.push([query, params])}}); // prettier-ignore
  const view = sql.view`SELECT * FROM t WHERE x > ${1}`;
  await db.sql`SELECT ${sql.variant({duckdb: sql`'duckdb'`, default: sql`'other'`})} FROM ${view}`;
  const [[query, params]] = queries;
  assert.deepStrictEqual(params, [1]); // the view and the variant are flattened into the query
  assert.include(query, "'duckdb'"); // the variant uses the client’s dialect
  assert.notInclude(query, "'other'");
});
