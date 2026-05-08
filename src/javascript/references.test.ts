import type {Identifier} from "acorn";
import {expect, test} from "vitest";
import {parseJavaScript} from "./parse.js";

function find(input: string): Identifier[] {
  return parseJavaScript(input).references;
}

test("finds references in expressions", () => {
  expect(find(`foo + bar`)).toMatchSnapshot();
});

test("finds references in statements", () => {
  expect(find(`foo + bar;`)).toMatchSnapshot();
});

test("finds multiple references", () => {
  expect(find(`const a = b + c;\nconst d = c - b;`)).toMatchSnapshot();
});

test("doesn’t consider the identifier a reference", () => {
  expect(find(`function foo() { return bar; }`)).toMatchSnapshot();
});

test("local variables can mask references", () => {
  expect(find(`{ let foo; foo + bar; }`)).toMatchSnapshot();
});

test("local variables cannot mask references", () => {
  expect(find(`{ foo + bar; { let foo; } }`)).toMatchSnapshot();
});

test("function parameters can mask references", () => {
  expect(find(`foo => foo + bar`)).toMatchSnapshot();
});

test("function rest parameters can mask references", () => {
  expect(find(`(...foo) => foo + bar`)).toMatchSnapshot();
});

test("destructured variables can mask references", () => {
  expect(find(`{ let {foo} = null; foo + bar; }`)).toMatchSnapshot();
});

test("destructured rest variables can mask references", () => {
  expect(find(`{ let {...foo} = null; foo + bar; }`)).toMatchSnapshot();
});

test("ignores globals", () => {
  expect(find(`window + bar`)).toMatchSnapshot();
});
