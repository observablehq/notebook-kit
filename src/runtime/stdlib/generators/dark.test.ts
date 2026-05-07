// @vitest-environment jsdom
import {afterAll, afterEach, assert, test, vi} from "vitest";
import {dark} from "./dark.js";

// jsdom doesn't provide matchMedia; stub the subset dark() uses.
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {}
}));

afterAll(() => vi.unstubAllGlobals());
afterEach(() => { document.body.style.colorScheme = ""; });

test("dark yields true when color-scheme is dark", async () => {
  document.body.style.colorScheme = "dark";
  const o = dark();
  assert.strictEqual((await o.next()).value, true);
  await o.return();
});

test("dark yields false when color-scheme is light", async () => {
  document.body.style.colorScheme = "light";
  const o = dark();
  assert.strictEqual((await o.next()).value, false);
  await o.return();
});

test("dark updates when body color-scheme changes", async () => {
  document.body.style.colorScheme = "light";
  const o = dark();
  assert.strictEqual((await o.next()).value, false);
  const probe = document.body.firstElementChild!;
  document.body.style.colorScheme = "dark";
  probe.dispatchEvent(new Event("transitionstart"));
  assert.strictEqual((await o.next()).value, true);
  document.body.style.colorScheme = "light";
  probe.dispatchEvent(new Event("transitionstart"));
  assert.strictEqual((await o.next()).value, false);
  await o.return();
});
