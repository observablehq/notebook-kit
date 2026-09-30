import {assert, test} from "vitest";
import type {Plugin} from "vite";
import {observable, resolveNpmId} from "./observable.js";

test("resolves npm imports from the pre Vite plugin", () => {
  const plugin = observable() as Plugin;
  assert.strictEqual(plugin.enforce, "pre");
  assert.strictEqual(plugin.resolveId, resolveNpmId);
  assert.deepStrictEqual(resolveNpmId("npm:d3"), {
    id: "https://cdn.jsdelivr.net/npm/d3/+esm",
    external: true
  });
  assert.strictEqual(resolveNpmId("./local.js"), null);
});
