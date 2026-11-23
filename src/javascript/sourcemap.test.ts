import {assert, test} from "vitest";
import {Sourcemap} from "./sourcemap.js";

test("identity", () => {
  const sm = new Sourcemap("");
  assert.strictEqual(sm.toString(), "");
  assert.deepStrictEqual(sm.translate({line: 1, column: 0}), {line: 1, column: 0});
});

test("insert at beginning", () => {
  const original = "hello;";
  const sm = new Sourcemap(original);
  sm.insertLeft(0, "return ");
  assert.strictEqual(sm.toString(), "return hello;");
  assert.deepStrictEqual(sm.translate({line: 1, column: 7}), {line: 1, column: 0});
});

test("insertLeft at beginning twice", () => {
  const original = "hello;";
  const sm = new Sourcemap(original);
  sm.insertLeft(0, " ");
  sm.insertLeft(0, "return");
  assert.strictEqual(sm.toString(), "return hello;");
  assert.deepStrictEqual(sm.translate({line: 1, column: 7}), {line: 1, column: 0});
});

test("insert right at beginning", () => {
  const original = "hello;";
  const sm = new Sourcemap(original);
  sm.insertLeft(0, "return");
  sm.insertRight(0, " ");
  assert.strictEqual(sm.toString(), "return hello;");
  assert.deepStrictEqual(sm.translate({line: 1, column: 7}), {line: 1, column: 0});
});

test("insert at end", () => {
  const original = "hello";
  const sm = new Sourcemap(original);
  sm.insertLeft(original.length, "();");
  assert.strictEqual(sm.toString(), "hello();");
  assert.deepStrictEqual(sm.translate({line: 1, column: 8}), {line: 1, column: 5});
});

test("insert at end twice is insertLeft", () => {
  const original = "hello";
  const sm = new Sourcemap(original);
  sm.insertLeft(original.length, ";");
  sm.insertLeft(original.length, "()");
  assert.strictEqual(sm.toString(), "hello();");
  assert.deepStrictEqual(sm.translate({line: 1, column: 8}), {line: 1, column: 5});
});

test("insert right at end", () => {
  const original = "hello";
  const sm = new Sourcemap(original);
  sm.insertLeft(original.length, "()");
  sm.insertRight(original.length, ";");
  assert.strictEqual(sm.toString(), "hello();");
  assert.deepStrictEqual(sm.translate({line: 1, column: 8}), {line: 1, column: 5});
});

test("insert new lines", () => {
  const original = "hello";
  const sm = new Sourcemap(original);
  sm.insertLeft(0, "function() {\n");
  sm.insertRight(original.length, "\n}");
  assert.strictEqual(sm.toString(), "function() {\nhello\n}");
  assert.deepStrictEqual(sm.translate({line: 1, column: 7}), {line: 1, column: 0});
  assert.deepStrictEqual(sm.translate({line: 2, column: 0}), {line: 1, column: 0});
  assert.deepStrictEqual(sm.translate({line: 3, column: 1}), {line: 1, column: 5});
});

test("replace new line", () => {
  const original = "\nhello";
  const sm = new Sourcemap(original);
  sm.replaceLeft(0, 1, "function() {\n");
  assert.strictEqual(sm.toString(), "function() {\nhello");
  assert.deepStrictEqual(sm.translate({line: 2, column: 0}), {line: 2, column: 0});
});

test("delete", () => {
  const original = "hello;";
  const sm = new Sourcemap(original);
  sm.delete(original.length - 1, original.length);
  assert.strictEqual(sm.toString(), "hello");
});

test("complete replace", () => {
  const original = "hello;";
  const sm = new Sourcemap(original);
  sm.replaceRight(0, original.length, "something else");
  assert.strictEqual(sm.toString(), "something else");
  assert.deepStrictEqual(sm.translate({line: 1, column: 0}), {line: 1, column: 0});
});

test("line-level granularity", () => {
  const sm = new Sourcemap("ab\ncd");
  sm.insertLeft(0, "foo");
  assert.deepStrictEqual(sm.translate({line: 1, column: 4}), {line: 1, column: 1});
});

test("slice applies only the edits within the given range", () => {
  const sm = new Sourcemap("a + b + c");
  sm.replaceLeft(0, 1, "x");
  sm.replaceLeft(4, 5, "y");
  sm.insertLeft(9, ";");
  assert.strictEqual(sm.slice(4, 5), "y");
  assert.strictEqual(sm.slice(2, 9), "+ y + c;");
  assert.strictEqual(sm.slice(), "x + y + c;");
  assert.strictEqual(sm.toString(), "x + y + c;");
});
