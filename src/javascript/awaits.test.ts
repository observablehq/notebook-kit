import type {Node} from "acorn";
import {assert, expect, test} from "vitest";
import {findAwaits} from "./awaits.js";
import {parseJavaScript} from "./parse.js";

function find(input: string): Node[] {
  return findAwaits(parseJavaScript(input).body);
}

test("finds top-level awaits", () => {
  expect(find("await 1;")).toMatchSnapshot();
  expect(find("(1, await 2);")).toMatchSnapshot();
  expect(find("1 + await 2;")).toMatchSnapshot();
  expect(find("if (true) { await 3; }")).toMatchSnapshot();
  expect(find("for await (const f of []);")).toMatchSnapshot();
  expect(find("for (const f of await []);")).toMatchSnapshot();
  expect(find("let f, g; for ({[await f]: g} of await []);")).toMatchSnapshot();
  expect(find("for (const f of []) await f;")).toMatchSnapshot();
  expect(find("for (const f in await {});")).toMatchSnapshot();
});

test("ignores awaits within functions", () => {
  assert.deepStrictEqual(find("async function f() { await 1; }"), []);
  assert.deepStrictEqual(find("let f = (async function () { await 1; });"), []);
  assert.deepStrictEqual(find("let f = (async () => { await 1; });"), []);
});
