// @vitest-environment jsdom
import {afterEach, assert, test} from "vitest";
import {dark} from "./dark.js";

// jsdom doesn't provide matchMedia; stub the subset dark() uses.
// Vitest's file-level isolation scopes this mutation to the current file.
// @ts-expect-error — partial stub of MediaQueryList
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {}
});

afterEach(() => {
  document.body.style.colorScheme = "";
});

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
  // dark() appends a probe as the first child of body; simulate a theme
  // transition by flipping color-scheme and firing transitionstart on it.
  const probe = document.body.firstElementChild!;
  document.body.style.colorScheme = "dark";
  probe.dispatchEvent(new Event("transitionstart"));
  assert.strictEqual((await o.next()).value, true);
  document.body.style.colorScheme = "light";
  probe.dispatchEvent(new Event("transitionstart"));
  assert.strictEqual((await o.next()).value, false);
  await o.return();
});
