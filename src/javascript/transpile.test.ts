import {expect, it} from "vitest";
import {transpile} from "./transpile.js";

it("transpiles JavaScript expressions", () => {
  expect(transpile("1 + 2", "js")).toMatchSnapshot();
  expect(transpile("x + y", "js")).toMatchSnapshot();
  expect(transpile("await z", "js")).toMatchSnapshot();
  expect(transpile("display(1), display(2)", "js")).toMatchSnapshot();
});

it("transpiles empty cells", () => {
  expect(transpile("", "js")).toMatchSnapshot();
  expect(transpile("", "md")).toMatchSnapshot();
  expect(transpile("", "html")).toMatchSnapshot();
  expect(transpile("", "tex")).toMatchSnapshot();
  expect(transpile("", "sql")).toMatchSnapshot();
});

it("transpiles JavaScript programs", () => {
  expect(transpile("const x = 1, y = 2;", "js")).toMatchSnapshot();
  expect(transpile("x + y;", "js")).toMatchSnapshot();
  expect(transpile("await z;", "js")).toMatchSnapshot();
});

it("transpiles static npm: imports", () => {
  expect(transpile('import * as d3 from "npm:d3";', "js")).toMatchSnapshot();
  expect(transpile('import _ from "npm:lodash";', "js")).toMatchSnapshot();
  expect(transpile('import {} from "npm:d3";\nimport "npm:isoformat";', "js")).toMatchSnapshot();
});

it("transpiles dynamic npm: imports", () => {
  expect(transpile('const d3 = await import("npm:d3");', "js")).toMatchSnapshot();
});

it("transpiles static observable: imports", () => {
  expect(transpile('import {Scrubber} from "observable:@mbostock/scrubber";', "js")).toMatchSnapshot();
  expect(transpile('import {viewof$rotation} from "observable:@rreusser/drawing-3d-objects-with-svg";', "js")).toMatchSnapshot();
});

it("transpiles static imports with {type: 'observable'}", () => {
  expect(transpile('import {Scrubber} from "https://api.observablehq.com/@mbostock/scrubber.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
  expect(transpile('import {viewof$rotation} from "https://api.observablehq.com/@rreusser/drawing-3d-objects-with-svg.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
});

it("transpiles Observable JavaScript imports", () => {
  expect(transpile('import {figure, viewof rotation} from "@rreusser/drawing-3d-objects-with-svg"', "ojs")).toMatchSnapshot();
  expect(transpile('import {figure, viewof rotation as rot} from "@rreusser/drawing-3d-objects-with-svg"', "ojs")).toMatchSnapshot();
});

it("transpiles import.meta.resolve", () => {
  expect(transpile('import.meta.resolve("npm:d3")', "js")).toMatchSnapshot();
  expect(transpile('import.meta.resolve("./test")', "js", {resolveLocalImports: true})).toMatchSnapshot();
  expect(transpile('import.meta.resolve("./test")', "js", {resolveLocalImports: false})).toMatchSnapshot();
});

it("transpiles node cells", () => {
  expect(transpile("process.stdout.write(`Node ${process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node \\${process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node \\\\${process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node $\\{process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node \\$\\{process.version}`);", "node")).toMatchSnapshot();
});

it("transpiles DatabaseClient", () => {
  expect(transpile('const client = new DatabaseClient("name", {type: "duckdb"});', "js")).toMatchSnapshot();
});

it("rewrites DatabaseClient calls with type option", () => {
  const databases = new Map([["duckdb-base", {type: "duckdb"}], ["postgres-base", {type: "postgres"}], ["mydb-base", {type: "sqlite"}]]);
  expect(transpile('DatabaseClient("duckdb-base")', "js", {databases})).toMatchSnapshot();
  expect(transpile('const client = DatabaseClient("postgres-base");', "js", {databases})).toMatchSnapshot();
  expect(transpile('const x = DatabaseClient("mydb-base");', "js", {databases})).toMatchSnapshot();
});

it("does not rewrite DatabaseClient with existing options", () => {
  const databases = new Map([["duckdb-base", {type: "duckdb"}]]);
  expect(transpile('DatabaseClient("duckdb-base", {id: 1})', "js", {databases})).toMatchSnapshot();
  expect(transpile('DatabaseClient("duckdb-base", {type: "postgres"})', "js", {databases})).toMatchSnapshot();
});

it("throws error for unknown database name", () => {
  const databases = new Map([["duckdb-base", {type: "duckdb"}]]);
  expect(() => transpile('DatabaseClient("unknown")', "js", {databases})).toThrow("database not found: unknown");
});

it("throws error for non-string-literal database name", () => {
  const databases = new Map([["duckdb-base", {type: "duckdb"}]]);
  expect(() => transpile("DatabaseClient(dbName)", "js", {databases})).toThrow("DatabaseClient name must be a string literal");
  expect(() => transpile("DatabaseClient(`template-${x}`)", "js", {databases})).toThrow("DatabaseClient name must be a string literal");
});

it("rewrites DatabaseClient with default database names", () => {
  const databases = new Map();
  expect(transpile('DatabaseClient("postgres")', "js", {databases})).toMatchSnapshot();
  expect(transpile('DatabaseClient("duckdb")', "js", {databases})).toMatchSnapshot();
  expect(transpile('DatabaseClient("sqlite")', "js", {databases})).toMatchSnapshot();
});

it("rewrites DatabaseClient with file extension detection", () => {
  const databases = new Map();
  expect(transpile('DatabaseClient("data.duckdb")', "js", {databases})).toMatchSnapshot();
  expect(transpile('DatabaseClient("mydata.db")', "js", {databases})).toMatchSnapshot();
  expect(transpile('DatabaseClient("path/to/file.duckdb")', "js", {databases})).toMatchSnapshot();
  expect(transpile('DatabaseClient("path/to/file.db")', "js", {databases})).toMatchSnapshot();
});
