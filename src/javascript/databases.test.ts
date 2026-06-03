import {expect, test} from "vitest";
import {parseJavaScript} from "./parse.js";
import type {FeatureExpression} from "./features.js";

function find(input: string): FeatureExpression[] {
  return parseJavaScript(input).databases;
}

test("finds databases", () => {
  expect(find(`DatabaseClient("foo")`)).toMatchSnapshot();
});

test("allows additional arguments", () => {
  expect(find(`DatabaseClient("foo", {since: "2021-01-01T12:34:56.789Z"})`)).toMatchSnapshot();
});

test("disallows dynamic arguments", () => {
  expect(() => find(`DatabaseClient("foo" + bar)`)).toThrow(/literal string/);
});

test("ignores shadowed references", () => {
  expect(find(`const DatabaseClient = () => {};\nDatabaseClient("foo");`)).toStrictEqual([]);
  expect(find(`DatabaseClient("foo");\nconst DatabaseClient = () => {};`)).toStrictEqual([]);
  expect(find(`DatabaseClient("foo");\nvar DatabaseClient = () => {};`)).toStrictEqual([]);
  expect(find(`function DatabaseClient() {}\nDatabaseClient("foo");`)).toStrictEqual([]);
  expect(find(`function DatabaseClient() {}\nDatabaseClient("foo" + Math.random());`)).toStrictEqual([]); // prettier-ignore
});

test("ignores aliased references", () => {
  expect(find(`const D = DatabaseClient;\nD("foo");`)).toStrictEqual([]);
});
