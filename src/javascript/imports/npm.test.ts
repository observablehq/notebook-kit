import {assert, test} from "vitest";
import {resolveNpmImport} from "./npm.js";

test("adds /+esm as expected", () => {
  assert.strictEqual(
    resolveNpmImport("npm:prettier"),
    "https://cdn.jsdelivr.net/npm/prettier/+esm" // defaults to /+esm
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/"),
    "https://cdn.jsdelivr.net/npm/prettier/" // no /+esm because trailing slash
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/+esm"),
    "https://cdn.jsdelivr.net/npm/prettier/+esm" // preserve existing /+esm
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/acorn"),
    "https://cdn.jsdelivr.net/npm/prettier/plugins/acorn/+esm"
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/acorn/+esm"),
    "https://cdn.jsdelivr.net/npm/prettier/plugins/acorn/+esm" // preserve existing /+esm
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/acorn/"),
    "https://cdn.jsdelivr.net/npm/prettier/plugins/acorn/" // no /+esm because trailing slash
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/acorn.js"),
    "https://cdn.jsdelivr.net/npm/prettier/plugins/acorn.js" // no /+esm because file extension
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/acorn.js/+esm"),
    "https://cdn.jsdelivr.net/npm/prettier/plugins/acorn.js/+esm" // preserve existing /+esm
  );
  assert.strictEqual(
    resolveNpmImport("npm:leaflet/dist/leaflet.css"),
    "https://cdn.jsdelivr.net/npm/leaflet/dist/leaflet.css" // no /+esm because non-JS file
  );
  assert.strictEqual(
    resolveNpmImport("npm:foo/data.json"),
    "https://cdn.jsdelivr.net/npm/foo/data.json" // no /+esm because non-JS file
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/estree"),
    "https://cdn.jsdelivr.net/npm/prettier/plugins/estree/+esm"
  );
});

test("sets the default version of @duckdb/duckdb-wasm", () => {
  assert.strictEqual(
    resolveNpmImport("npm:@duckdb/duckdb-wasm"),
    "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm"
  );
  assert.strictEqual(
    resolveNpmImport("npm:@duckdb/duckdb-wasm/+esm"),
    "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm"
  );
  assert.strictEqual(
    resolveNpmImport("npm:@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm"),
    "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/dist/duckdb-mvp.wasm"
  );
});

test("sets the default path for various libraries", () => {
  assert.strictEqual(
    resolveNpmImport("npm:mermaid"),
    "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs/+esm"
  );
  assert.strictEqual(
    resolveNpmImport("npm:echarts"),
    "https://cdn.jsdelivr.net/npm/echarts/dist/echarts.esm.min.js/+esm"
  );
  assert.strictEqual(
    resolveNpmImport("npm:jquery-ui"),
    "https://cdn.jsdelivr.net/npm/jquery-ui/dist/jquery-ui.js/+esm"
  );
  assert.strictEqual(
    resolveNpmImport("npm:deck.gl"),
    "https://cdn.jsdelivr.net/npm/deck.gl/dist.min.js/+esm"
  );
  assert.strictEqual(
    resolveNpmImport("npm:react-dom"),
    "https://cdn.jsdelivr.net/npm/react-dom/client/+esm"
  );
});
