import {assert, test} from "vitest";
import {dedollar} from "./observable.js";

test("unescapes dollar signs in imported symbols", () => {
  assert.strictEqual(dedollar("viewof$foo"), "viewof foo");
  assert.strictEqual(dedollar("viewof$"), "viewof ");
  assert.strictEqual(dedollar("$viewof"), " viewof");
  assert.strictEqual(dedollar("viewof$$foo"), "viewof$foo");
  assert.strictEqual(dedollar("viewof$$$foo"), "viewof$$foo");
  assert.strictEqual(dedollar("$"), " ");
  assert.strictEqual(dedollar("$$"), "$");
  assert.strictEqual(dedollar("$$$"), "$$");
  assert.strictEqual(dedollar("$$_"), "$_");
});
