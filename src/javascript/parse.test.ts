import {assert, test} from "vitest";
import {parseJavaScript} from "./parse.js";

test("parses JSX only in the tsx dialect", () => {
  assert.throws(() => parseJavaScript("<div />", "js"), SyntaxError);
  assert.throws(() => parseJavaScript("<div />", "ts"), SyntaxError);
  assert.strictEqual(parseJavaScript("<div />", "tsx").body.type, "JSXElement");
});

test("parses tsx expressions and programs", () => {
  const expression = parseJavaScript("<Foo bar={1 as number} />", "tsx");
  assert.strictEqual(expression.expression, true);
  assert.deepStrictEqual(expression.declarations, null);
  const program = parseJavaScript("const a: number = 1;\nconst b = <p>{a}</p>;", "tsx");
  assert.strictEqual(program.expression, false);
  assert.deepStrictEqual(program.declarations?.map((d) => d.name), ["a", "b"]);
});

test("parses top-level await and file attachments in tsx", () => {
  const cell = parseJavaScript('<pre>{await FileAttachment("a.txt").text()}</pre>', "tsx");
  assert.strictEqual(cell.async, true);
  assert.deepStrictEqual(cell.files.map((f) => f.argument), ["a.txt"]);
});

test("rejects non-erasable TypeScript syntax in tsx", () => {
  assert.throws(() => parseJavaScript("enum Direction { Up, Down }", "tsx"), SyntaxError);
  assert.throws(() => parseJavaScript("namespace N { export const x = 1; }", "tsx"), SyntaxError);
});

test("treats generic arrow functions in tsx as TypeScript, not JSX", () => {
  assert.strictEqual(parseJavaScript("<T,>(x: T) => x", "tsx").body.type, "ArrowFunctionExpression");
});
