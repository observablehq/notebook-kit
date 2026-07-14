import {assert, describe, test} from "vitest";
import {sql, SqlFragment, SqlView} from "./sql.js";
import type {QueryResult, SqlDialect} from "./databaseClient.js";

describe("sql`…`", () => {
  test("defines a SQL fragment", () => {
    assert.deepStrictEqual(sql`PURCHASES`, new SqlFragment(["PURCHASES"], []));
    assert.deepStrictEqual(sql`FOO = ${42}`, new SqlFragment(["FOO = ", ""], [42]));
    assert.deepStrictEqual(sql`${1} = ${2}`, new SqlFragment(["", " = ", ""], [1, 2]));
    assert.deepStrictEqual(sql`FOO = ${sql`42`}`, new SqlFragment(["FOO = ", ""], [sql`42`]));
  });
  test("maintains reference equality with SQL params", () => {
    const val = sql`42`;
    assert.strictEqual(sql`FOO = ${val}`.params[0], val);
  });
});

describe("sql.view`…`", () => {
  test("defines a SQL view", () => {
    assert.deepStrictEqual(sql.view`SELECT * FROM FOO`, new SqlView(["SELECT * FROM FOO"], []));
    assert.deepStrictEqual(sql.view`SELECT * FROM FOO WHERE BAR = ${42}`, new SqlView(["SELECT * FROM FOO WHERE BAR = ", ""], [42])); // prettier-ignore
    assert.deepStrictEqual(sql.view`SELECT * FROM FOO WHERE BAR = ${sql`42`}`, new SqlView(["SELECT * FROM FOO WHERE BAR = ", ""], [sql`42`])); // prettier-ignore
  });
  test("maintains reference equality with SQL params", () => {
    const bar = sql`42`;
    const foo = sql.view`SELECT * FROM FOO WHERE BAR = ${bar}`;
    assert.strictEqual(foo.params[0], bar);
    assert.strictEqual(sql.view`SELECT * FROM ${foo}`.params[0], foo);
  });
  test("sql.view`…`.flat() returns a SqlView", () => {
    assert.instanceOf(sql.view`SELECT ${sql`1`}`.flat(), SqlView);
  });
  test("sql.view`…`.toDialect() returns a SqlView", () => {
    assert.instanceOf(sql.view`SELECT ${sql.variant({default: sql`1`})}`.toDialect(), SqlView);
  });
});

describe("sql`…`.flat()", () => {
  test("returns a flattened SQL fragment", () => {
    assert.deepStrictEqual(sql`FOO = 42`.flat(), new SqlFragment(["FOO = 42"], []));
    assert.deepStrictEqual(sql`FOO = ${42}`.flat(), new SqlFragment(["FOO = ", ""], [42]));
    assert.deepStrictEqual(sql`FOO = ${sql`42`}`.flat(), new SqlFragment(["FOO = 42"], []));
    assert.deepStrictEqual(sql`FOO = ${sql`${42}`}`.flat(), new SqlFragment(["FOO = ", ""], [42]));
  });
  test("handles arbitrarily nested SQL", () => {
    assert.deepStrictEqual(sql`ORDER BY 3, ${sql`2 ${sql`DESC`}`}`.flat(), new SqlFragment(["ORDER BY 3, 2 DESC"], []));
  });
  test("adds a WITH clause for selected views", () => {
    const view = sql.view`SELECT * FROM PURCHASES`;
    assert.deepStrictEqual(
      sql`SELECT * FROM ${view}`.flat(),
      new SqlFragment(
        [
          `WITH
"_1" AS (SELECT * FROM PURCHASES)
SELECT * FROM "_1"`
        ],
        []
      )
    );
  });
  test("handles multiple views", () => {
    const view1 = sql.view`SELECT * FROM PURCHASES`;
    const view2 = sql.view`SELECT * FROM SURVEYS`;
    assert.deepStrictEqual(
      sql`SELECT * FROM ${view1} UNION ALL SELECT * FROM ${view2}`.flat(),
      new SqlFragment(
        [
          `WITH
"_1" AS (SELECT * FROM PURCHASES),
"_2" AS (SELECT * FROM SURVEYS)
SELECT * FROM "_1" UNION ALL SELECT * FROM "_2"`
        ],
        []
      )
    );
  });
  test("respects the specified dialect", () => {
    const view1 = sql.view`SELECT * FROM PURCHASES`;
    const view2 = sql.view`SELECT * FROM SURVEYS`;
    assert.deepStrictEqual(
      sql`SELECT * FROM ${view1} UNION ALL SELECT * FROM ${view2}`.flat("databricks"),
      new SqlFragment(
        [
          `WITH
\`_1\` AS (SELECT * FROM PURCHASES),
\`_2\` AS (SELECT * FROM SURVEYS)
SELECT * FROM \`_1\` UNION ALL SELECT * FROM \`_2\``
        ],
        []
      )
    );
  });
  test("combines with an existing WITH clause", () => {
    const view = sql.view`SELECT * FROM PURCHASES`;
    assert.deepStrictEqual(
      sql`WITH FOO AS (SELECT * FROM BAR)
SELECT * FROM ${view}
UNION ALL SELECT * FROM FOO`.flat(),
      new SqlFragment(
        [
          `WITH
"_1" AS (SELECT * FROM PURCHASES),
 FOO AS (SELECT * FROM BAR)
SELECT * FROM "_1"
UNION ALL SELECT * FROM FOO`
        ],
        []
      )
    );
  });
  test("consolidates multiple references to the same view", () => {
    const view = sql.view`SELECT * FROM PURCHASES`;
    assert.deepStrictEqual(
      sql`SELECT * FROM ${view} UNION ALL SELECT * FROM ${view}`.flat(),
      new SqlFragment(
        [
          `WITH
"_1" AS (SELECT * FROM PURCHASES)
SELECT * FROM "_1" UNION ALL SELECT * FROM "_1"`
        ],
        []
      )
    );
  });
  test("hoists chained views in topological order", () => {
    const purchases = sql.view`SELECT * FROM PURCHASES`;
    const filtered = sql.view`SELECT * FROM ${purchases} WHERE FOO = 42`;
    assert.deepStrictEqual(
      sql`SELECT * FROM ${filtered}`.flat(),
      new SqlFragment(
        [
          `WITH
"_2" AS (SELECT * FROM PURCHASES),
"_1" AS (SELECT * FROM "_2" WHERE FOO = 42)
SELECT * FROM "_1"`
        ],
        []
      )
    );
  });
  test("orders params by CTE definition when chaining views", () => {
    const inner = sql.view`SELECT * FROM PURCHASES WHERE X = ${1}`;
    const outer = sql.view`SELECT * FROM ${inner} WHERE Y = ${2}`;
    assert.deepStrictEqual(
      sql`SELECT * FROM ${outer}`.flat(),
      new SqlFragment(
        [
          `WITH
"_2" AS (SELECT * FROM PURCHASES WHERE X = `,
          `),
"_1" AS (SELECT * FROM "_2" WHERE Y = `,
          `)
SELECT * FROM "_1"`
        ],
        [1, 2]
      )
    );
  });
  test("avoids conflicts with existing unquoted table names", () => {
    const view = sql.view`SELECT * FROM PURCHASES`;
    assert.deepStrictEqual(
      sql`SELECT * FROM ${view} UNION ALL SELECT * FROM _1`.flat(),
      new SqlFragment(
        [
          `WITH
"_2" AS (SELECT * FROM PURCHASES)
SELECT * FROM "_2" UNION ALL SELECT * FROM _1`
        ],
        []
      )
    );
  });
  test("avoids conflicts with existing quoted table names", () => {
    const view = sql.view`SELECT * FROM PURCHASES`;
    assert.deepStrictEqual(
      sql`SELECT * FROM ${view} UNION ALL SELECT * FROM "_1"`.flat(),
      new SqlFragment(
        [
          `WITH
"_2" AS (SELECT * FROM PURCHASES)
SELECT * FROM "_2" UNION ALL SELECT * FROM "_1"`
        ],
        []
      )
    );
  });
  test("returns itself if the SQL fragment is already flat", () => {
    const input = sql`42`;
    const output = input.flat();
    assert.strictEqual(input, output);
  });
});

describe("sql`…`.toDialect(dialect)", () => {
  test("converts the SQL fragment to the specified dialect", () => {
    assert.deepStrictEqual(sql`SELECT ${sql.variant({duckdb: "DUCKDB"})}`.toDialect("duckdb"), sql`SELECT ${"DUCKDB"}`);
  });
  test("handles the default dialect", () => {
    const fragment = sql`SELECT ${sql.variant({duckdb: "DUCKDB", default: "DEFAULT"})}`;
    assert.deepStrictEqual(fragment.toDialect("duckdb"), sql`SELECT ${"DUCKDB"}`);
    assert.deepStrictEqual(fragment.toDialect("postgres"), sql`SELECT ${"DEFAULT"}`);
    assert.deepStrictEqual(fragment.toDialect("unknown" as SqlDialect), sql`SELECT ${"DEFAULT"}`);
    assert.deepStrictEqual(fragment.toDialect(), sql`SELECT ${"DEFAULT"}`);
  });
  test("throws an error for unknown dialects", () => {
    assert.throws(() => sql`SELECT ${sql.variant({duckdb: "DUCKDB"})}`.toDialect("postgres"), /missing variant/);
  });
  test("converts nested SQL fragments", () => {
    assert.deepStrictEqual(
      sql`SELECT COUNT(*) FROM ${sql.view`SELECT ${sql.variant({duckdb: "DUCKDB"})}`}`.toDialect("duckdb"), // prettier-ignore
      sql`SELECT COUNT(*) FROM ${sql.view`SELECT ${"DUCKDB"}`}`
    );
  });
  test("converts nested SQL variants", () => {
    const v1 = sql.variant({duckdb: "DUCKDB"});
    const v2 = sql.variant({duckdb: sql`${v1}`});
    assert.deepStrictEqual(v2.toDialect("duckdb"), sql`${"DUCKDB"}`);
  });
  test("converts nested SQL variants (2)", () => {
    const v1 = sql.variant({duckdb: "DUCKDB"});
    const v2 = sql.variant({duckdb: v1});
    assert.deepStrictEqual(v2.toDialect("duckdb"), "DUCKDB");
  });
  test("handles dialect- and non-dialect-specific fragments", () => {
    assert.deepStrictEqual(
      sql`SELECT ${sql`COUNT(*)`} FROM ${sql.view`SELECT ${sql.variant({duckdb: "DUCKDB"})}`}`.toDialect("duckdb"), // prettier-ignore
      sql`SELECT ${sql`COUNT(*)`} FROM ${sql.view`SELECT ${"DUCKDB"}`}`
    );
    assert.deepStrictEqual(
      sql`SELECT COUNT(*) FROM ${sql.view`SELECT ${sql.variant({duckdb: "DUCKDB"})}`} WHERE ${sql`FOO`}`.toDialect("duckdb"), // prettier-ignore
      sql`SELECT COUNT(*) FROM ${sql.view`SELECT ${"DUCKDB"}`} WHERE ${sql`FOO`}`
    );
  });
  test("returns itself if the fragment is not dialect-specific", () => {
    const fragment = sql`SELECT ${sql`1 + ${2}`}`;
    assert.strictEqual(fragment.toDialect("duckdb"), fragment);
    assert.strictEqual(fragment.toDialect(), fragment);
  });
});

describe("sql`…`.query(database)", () => {
  test("queries the specified database via database.sql", async () => {
    const args: unknown[] = [];
    const result: QueryResult = Object.assign([], {schema: [], date: new Date()});
    const output = await sql`SELECT * FROM ${sql`PURCHASES`}`.query({
      name: "",
      options: {},
      async sql<T>(strings: Readonly<string[]>, ...params: unknown[]) {
        args.push(strings, ...params);
        return result as QueryResult<T>;
      }
    });
    assert.strictEqual(output, result);
    assert.deepStrictEqual(args, [["SELECT * FROM PURCHASES"]]);
  });
  test("flattens any views", async () => {
    const view = sql.view`SELECT * FROM PURCHASES WHERE FOO = ${42}`;
    const args: unknown[] = [];
    const result: QueryResult = Object.assign([], {schema: [], date: new Date()});
    const output = await sql`SELECT * FROM ${view}`.query({
      name: "",
      options: {},
      async sql<T>(strings: Readonly<string[]>, ...params: unknown[]) {
        args.push(strings, ...params);
        return result as QueryResult<T>;
      }
    });
    assert.strictEqual(output, result);
    assert.deepStrictEqual(args, [
      [
        `WITH
"_1" AS (SELECT * FROM PURCHASES WHERE FOO = `,
        `)
SELECT * FROM "_1"`
      ],
      42
    ]);
  });
  test("flattens chained views", async () => {
    const inner = sql.view`SELECT * FROM PURCHASES WHERE X = ${1}`;
    const outer = sql.view`SELECT * FROM ${inner}`;
    const args: unknown[] = [];
    const result: QueryResult = Object.assign([], {schema: [], date: new Date()});
    const output = await sql`SELECT * FROM ${outer}`.query({
      name: "",
      options: {},
      async sql<T>(strings: Readonly<string[]>, ...params: unknown[]) {
        args.push(strings, ...params);
        return result as QueryResult<T>;
      }
    });
    assert.strictEqual(output, result);
    assert.deepStrictEqual(args, [
      [
        `WITH
"_2" AS (SELECT * FROM PURCHASES WHERE X = `,
        `),
"_1" AS (SELECT * FROM "_2")
SELECT * FROM "_1"`
      ],
      1
    ]);
  });
  test("handles matching dialect-specific variants", async () => {
    const args: unknown[] = [];
    const result: QueryResult = Object.assign([], {schema: [], date: new Date()});
    const query = sql`SELECT * FROM ${sql.variant({duckdb: sql`PURCHASES_DUCKDB`, default: sql`PURCHASES`})}`;
    const output = await query.query({
      name: "",
      options: {},
      dialect: "duckdb",
      async sql<T>(strings: Readonly<string[]>, ...params: unknown[]) {
        args.push(strings, ...params);
        return result as QueryResult<T>;
      }
    });
    assert.strictEqual(output, result);
    assert.deepStrictEqual(args, [["SELECT * FROM PURCHASES_DUCKDB"]]);
  });
  test("handles default dialect-specific variants", async () => {
    const args: unknown[] = [];
    const result: QueryResult = Object.assign([], {schema: [], date: new Date()});
    const query = sql`SELECT * FROM ${sql.variant({duckdb: sql`PURCHASES_DUCKDB`, default: sql`PURCHASES`})}`;
    const output = await query.query({
      name: "",
      options: {},
      dialect: "postgres",
      async sql<T>(strings: Readonly<string[]>, ...params: unknown[]) {
        args.push(strings, ...params);
        return result as QueryResult<T>;
      }
    });
    assert.strictEqual(output, result);
    assert.deepStrictEqual(args, [["SELECT * FROM PURCHASES"]]);
  });
  test("does not duplicate dialect-specific views", async () => {
    const view = sql.view`SELECT v FROM ${sql.ident("table")}`;
    const query = sql`SELECT COUNT(*) FROM ${view}
UNION ALL SELECT SUM(v) FROM ${view}`.flat("duckdb");
    assert.deepStrictEqual(
      query,
      sql`WITH
\"_1\" AS (SELECT v FROM \"table\")
SELECT COUNT(*) FROM \"_1\"
UNION ALL SELECT SUM(v) FROM \"_1\"`
    );
  });
});

describe("sql.ident(name)", () => {
  test("quotes a name", () => {
    assert.deepStrictEqual(sql.ident("foo").toDialect(), sql`"foo"`);
    assert.deepStrictEqual(sql.ident("foo").toDialect("databricks"), sql`\`foo\``);
  });
  test("quotes a name with quotes", () => {
    assert.deepStrictEqual(sql.ident('fo"c"sle').toDialect(), sql`"fo""c""sle"`);
    assert.deepStrictEqual(sql.ident('fo"c"sle').toDialect("databricks"), sql`\`fo"c"sle\``);
    assert.deepStrictEqual(sql.ident("fo`c`sle").toDialect(), sql`"fo\`c\`sle"`);
    assert.deepStrictEqual(sql.ident("fo`c`sle").toDialect("databricks"), sql`\`fo\`\`c\`\`sle\``);
  });
});

describe("sql.text(value)", () => {
  test("quotes a value", () => {
    assert.deepStrictEqual(sql.text("foo").toDialect(), sql`'foo'`);
    assert.deepStrictEqual(sql.text("foo").toDialect("databricks"), sql`'foo'`);
  });
  test("quotes a value with quotes", () => {
    assert.deepStrictEqual(sql.text("fo'c'sle").toDialect(), sql`'fo''c''sle'`);
    assert.deepStrictEqual(sql.text("fo'c'sle").toDialect("databricks"), sql`'fo''c''sle'`);
  });
});

describe("sql.variant(variants)", () => {
  test("defines dialect-specific SQL variants", () => {
    const duckdb = sql`APPROX_QUANTILE`;
    const snowflake = sql`APPROX_PERCENTILE`;
    const variant = sql.variant({duckdb, snowflake});
    assert.deepStrictEqual(variant.toDialect("duckdb"), duckdb);
    assert.deepStrictEqual(variant.toDialect("snowflake"), snowflake);
  });
  test("allows a default dialect", () => {
    const duckdb = sql`APPROX_QUANTILE`;
    const snowflake = sql`APPROX_PERCENTILE`;
    const variant = sql.variant({default: duckdb, snowflake});
    assert.deepStrictEqual(variant.toDialect("duckdb"), duckdb);
    assert.deepStrictEqual(variant.toDialect("snowflake"), snowflake);
    assert.deepStrictEqual(variant.toDialect("postgres"), duckdb);
    assert.deepStrictEqual(variant.toDialect("unknown" as SqlDialect), duckdb);
    assert.deepStrictEqual(variant.toDialect(), duckdb);
  });
  test("supports variants with parameters", () => {
    const value = sql`PRICE_PER_UNIT`;
    const p = 0.5;
    const duckdb = sql`APPROX_QUANTILE(${value}, ${p})`;
    const snowflake = sql`APPROX_PERCENTILE(${value}, ${p})`;
    const postgres = sql`percentile_disc(${p}) WITHIN GROUP (ORDER BY ${value})`;
    const variant = sql.variant({duckdb, snowflake, postgres});
    assert.deepStrictEqual(variant.toDialect("duckdb"), duckdb);
    assert.deepStrictEqual(variant.toDialect("postgres"), postgres);
    assert.deepStrictEqual(variant.toDialect("snowflake"), snowflake);
  });
  test("supports literal variants", () => {
    const variant = sql.variant({duckdb: 0, snowflake: 1, postgres: 2});
    assert.strictEqual(variant.toDialect("duckdb"), 0);
    assert.strictEqual(variant.toDialect("snowflake"), 1);
    assert.strictEqual(variant.toDialect("postgres"), 2);
  });
  test("throws an error given an unsupported dialect", () => {
    const duckdb = sql`APPROX_QUANTILE`;
    const snowflake = sql`APPROX_PERCENTILE`;
    const variant = sql.variant({duckdb, snowflake});
    assert.throws(() => variant.toDialect("postgres"), /missing variant: postgres/);
    assert.throws(() => variant.toDialect(), /missing variant: undefined/);
  });
  test("implements toString", () => {
    assert.strictEqual(String(sql.variant({default: sql`"Shipping Address State"`})), '"Shipping Address State"');
  });
});
