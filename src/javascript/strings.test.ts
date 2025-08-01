import {assert, test} from "vitest";
import {isStringLiteral, getStringLiteralValue} from "./strings.js";
import {parseJavaScript} from "./parse.js";

function get(input: string): string {
  const {body} = parseJavaScript(input);
  if (!isStringLiteral(body)) throw new Error("input is not a string literal");
  return getStringLiteralValue(body);
}

function is(input: string): boolean {
  const {body} = parseJavaScript(input);
  return isStringLiteral(body);
}

test("returns the string literal value for simple string literals", () => {
  assert.strictEqual(get('"hello"'), "hello");
  assert.strictEqual(get('`hello`'), "hello");
  assert.strictEqual(get("'hello'"), "hello");
});

test("returns the string literal value for static string binary expressions", () => {
  assert.strictEqual(get('"hel" + "lo"'), "hello");
  assert.strictEqual(get('"hel" + `lo`'), "hello");
});

test("returns the string literal value for static string templates", () => {
  assert.strictEqual(get('`he${"ll"}o`'), "hello");
  assert.strictEqual(get('`he${"l" + "l"}o`'), "hello");
});

test("does not consider templates with dynamic quasis to be a string literal", () => {
  assert.strictEqual(is('`he${"l" + "1"}o`'), true);
  assert.strictEqual(is('`he${"l" + 1}o`'), false);
  assert.strictEqual(is('`he${ll}o`'), false);
});
