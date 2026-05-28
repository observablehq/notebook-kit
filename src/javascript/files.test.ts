import {expect, test} from "vitest";
import {parseJavaScript} from "./parse.js";
import type {FeatureExpression} from "./features.js";

function find(input: string): FeatureExpression[] {
  return parseJavaScript(input).files;
}

test("finds files", () => {
  expect(find(`FileAttachment("foo.csv")`)).toMatchSnapshot();
  expect(find(`FileAttachment('foo.csv')`)).toMatchSnapshot();
  expect(find(`FileAttachment(\`foo.csv\`)`)).toMatchSnapshot();
});

test("allows some simple static expressions", () => {
  expect(find(`FileAttachment("foo" + ".csv")`)).toMatchSnapshot();
  expect(find(`FileAttachment("foo" + "1" + ".csv")`)).toMatchSnapshot();
  expect(find(`FileAttachment(\`\${"foo"}.csv\`)`)).toMatchSnapshot();
  expect(find(`FileAttachment(\`\${"foo" + "1"}.csv\`)`)).toMatchSnapshot();
  expect(find(`FileAttachment("foo" + ".csv")`)[0].argument).toBe("foo.csv");
  expect(find(`FileAttachment("foo" + "1" + ".csv")`)[0].argument).toBe("foo1.csv");
  expect(find(`FileAttachment(\`\${"foo"}.csv\`)`)[0].argument).toBe("foo.csv");
  expect(find(`FileAttachment(\`\${"foo" + "1"}.csv\`)`)[0].argument).toBe("foo1.csv");
});

test("disallows dynamic arguments", () => {
  expect(() => find(`FileAttachment("foo" + bar + ".csv")`)).toThrow(/literal string/);
});

test("ignores shadowed references", () => {
  expect(find(`const FileAttachment = () => {};\nFileAttachment("foo.csv");`)).toStrictEqual([]);
  expect(find(`FileAttachment("foo.csv");\nconst FileAttachment = () => {};`)).toStrictEqual([]);
  expect(find(`FileAttachment("foo.csv");\nvar FileAttachment = () => {};`)).toStrictEqual([]);
  expect(find(`function FileAttachment() {}\nFileAttachment("foo.csv");`)).toStrictEqual([]);
  expect(find(`function FileAttachment() {}\nFileAttachment("foo" + Math.random());`)).toStrictEqual([]); // prettier-ignore
});

test("ignores aliased references", () => {
  expect(find(`const F = FileAttachment;\nF("foo.csv");`)).toStrictEqual([]);
});
