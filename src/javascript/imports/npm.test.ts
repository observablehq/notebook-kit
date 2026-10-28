import {assert, test} from "vitest";
import {resolveNpmImport} from "./npm.js";

test("resolves as expected", () => {
  assert.strictEqual(
    resolveNpmImport("npm:prettier"),
    "https://esm.sh/prettier" //
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/"),
    "https://esm.sh/prettier/" //
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/acorn"),
    "https://esm.sh/prettier/plugins/acorn"
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/acorn/"),
    "https://esm.sh/prettier/plugins/acorn/"
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/acorn.js"),
    "https://esm.sh/prettier/plugins/acorn.js"
  );
  assert.strictEqual(
    resolveNpmImport("npm:leaflet/dist/leaflet.css"),
    "https://esm.sh/leaflet/dist/leaflet.css"
  );
  assert.strictEqual(
    resolveNpmImport("npm:foo/data.json"),
    "https://esm.sh/foo/data.json" //
  );
  assert.strictEqual(
    resolveNpmImport("npm:prettier/plugins/estree"),
    "https://esm.sh/prettier/plugins/estree"
  );
});

test("sets the default version of @duckdb/duckdb-wasm", () => {
  assert.strictEqual(
    resolveNpmImport("npm:@duckdb/duckdb-wasm"),
    "https://esm.sh/@duckdb/duckdb-wasm@1.32.0"
  );
  assert.strictEqual(
    resolveNpmImport("npm:@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm"),
    "https://esm.sh/@duckdb/duckdb-wasm@1.32.0/dist/duckdb-mvp.wasm"
  );
});

test("sets the default path for various libraries", () => {
  assert.strictEqual(
    resolveNpmImport("npm:mermaid"),
    "https://esm.sh/mermaid/dist/mermaid.esm.min.mjs"
  );
  assert.strictEqual(
    resolveNpmImport("npm:echarts"),
    "https://esm.sh/echarts/dist/echarts.esm.min.js"
  );
  assert.strictEqual(
    resolveNpmImport("npm:jquery-ui"),
    "https://esm.sh/jquery-ui/dist/jquery-ui.js"
  );
  assert.strictEqual(
    resolveNpmImport("npm:deck.gl"),
    "https://esm.sh/deck.gl/dist.min.js" //
  );
  assert.strictEqual(
    resolveNpmImport("npm:react-dom"),
    "https://esm.sh/react-dom@19.3.1/client" //
  );
});

test("sets the default version of react and react-dom to match the standard library", () => {
  assert.strictEqual(resolveNpmImport("npm:react"), "https://esm.sh/react@19.3.1");
  assert.strictEqual(resolveNpmImport("npm:react/jsx-runtime"), "https://esm.sh/react@19.3.1/jsx-runtime"); // prettier-ignore
  assert.strictEqual(resolveNpmImport("npm:react-dom"), "https://esm.sh/react-dom@19.3.1/client"); // prettier-ignore
  assert.strictEqual(resolveNpmImport("npm:react@18"), "https://esm.sh/react@18");
});
