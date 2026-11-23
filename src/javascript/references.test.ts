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

// Excludes references to JSX, which are tested separately.
function findTsx(input: string): string[] {
  return parseJavaScript(input, "tsx")
    .references.map((r) => r.name)
    .filter((name) => name !== "JSX");
}

test("JSX elements and fragments reference JSX, unless it is a local", () => {
  const find = (input: string) => parseJavaScript(input, "tsx").references.map((r) => r.name);
  expect(find(`<div />`)).toEqual(["JSX"]);
  expect(find(`<></>`)).toEqual(["JSX"]);
  expect(find(`<Foo>{a}</Foo>`)).toEqual(["Foo", "a", "JSX"]);
  expect(find(`1 + 2`)).toEqual([]);
  expect(find(`(JSX) => <div />`)).toEqual([]);
  expect(find(`{ const JSX = {}; <div />; }`)).toEqual([]);
});

test("finds references in JSX expressions and attributes", () => {
  expect(findTsx(`<div title={a}>{b}{c}</div>`)).toEqual(["a", "b", "c"]);
  expect(findTsx(`<div {...a} b={<i>{c}</i>} />`)).toEqual(["a", "c"]);
  expect(findTsx(`<>{a}</>`)).toEqual(["a"]);
});

test("finds component tag names as references", () => {
  expect(findTsx(`<Foo />`)).toEqual(["Foo"]);
  expect(findTsx(`<Foo></Foo>`)).toEqual(["Foo"]);
  expect(findTsx(`<Foo.Bar.Baz />`)).toEqual(["Foo"]);
  expect(findTsx(`<foo.bar />`)).toEqual(["foo"]);
});

test("does not consider intrinsic tags or attribute names to be references", () => {
  expect(findTsx(`<div />`)).toEqual([]);
  expect(findTsx(`<my-element />`)).toEqual([]);
  expect(findTsx(`<svg:rect />`)).toEqual([]);
  expect(findTsx(`<div foo="1" bar />`)).toEqual([]);
});

test("local variables can mask JSX references", () => {
  expect(findTsx(`{ const Foo = 1; <Foo />; }`)).toEqual([]);
  expect(findTsx(`(Foo) => <Foo />`)).toEqual([]);
  expect(findTsx(`(foo) => <foo.Bar />`)).toEqual([]);
  expect(findTsx(`xs.map((x) => <li>{x}</li>)`)).toEqual(["xs"]);
});

test("finds references in TSX with types", () => {
  expect(findTsx(`const a: Foo = <Bar baz={qux as T} />;`)).toEqual(["Bar", "qux"]);
  expect(findTsx(`<T,>(x: T) => <Foo value={x} />`)).toEqual(["Foo"]);
});
