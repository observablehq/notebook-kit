import {expect, it} from "vitest";
import {parseTemplate, transpileTemplate} from "./template.js";
import type {CellSpec} from "../lib/notebook.js";
import {toCell} from "../lib/notebook.js";

function md(value: string): string {
  return transpileTemplate(toCell({id: 1, mode: "md", value}));
}

function html(value: string): string {
  return transpileTemplate(toCell({id: 1, mode: "html", value}));
}

function node(value: string): string {
  return transpileTemplate(toCell({id: 1, mode: "node", value}));
}

function sql(value: string, spec?: Partial<CellSpec>): string {
  return transpileTemplate(toCell({id: 1, mode: "sql", value, ...spec}));
}

it("parses a simple template", () => {
  expect(parseTemplate(`Hello, world!`)).toMatchSnapshot();
});

it("parses an empty template", () => {
  expect(parseTemplate(``)).toMatchSnapshot();
});

it("parses a template with an interpolated expression", () => {
  expect(parseTemplate(`Hello, $\{"world"}!`)).toMatchSnapshot();
});

it("parses a template with backquotes", () => {
  expect(parseTemplate(`Hello, \`world\`!`)).toMatchSnapshot();
});

it("parses a template with backslashes", () => {
  expect(parseTemplate(`Hello, \\world\\!`)).toMatchSnapshot();
});

it("transpiles a simple markdown template", () => {
  expect(md(`Hello, world!`)).toMatchSnapshot();
});

it("transpiles an empty markdown template", () => {
  expect(md(``)).toMatchSnapshot();
});

it("transpiles a markdown template with an interpolated expression", () => {
  expect(md(`Hello, $\{"world"}!`)).toMatchSnapshot();
});

it("transpiles a markdown template with backquotes", () => {
  expect(md(`Hello, \`world\`!`)).toMatchSnapshot();
});

it("transpiles a markdown template with backslashes", () => {
  expect(md(`Hello, \\world\\!`)).toMatchSnapshot();
});

it("transpiles a simple html template", () => {
  expect(html(`Hello, world!`)).toMatchSnapshot();
});

it("transpiles an empty html template", () => {
  expect(html(``)).toMatchSnapshot();
});

it("transpiles a html template with an interpolated expression", () => {
  expect(html(`Hello, $\{"world"}!`)).toMatchSnapshot();
});

it("transpiles a html template with backquotes", () => {
  expect(html(`Hello, \`world\`!`)).toMatchSnapshot();
});

it("transpiles a html template with backslashes", () => {
  expect(html(`Hello, \\world\\!`)).toMatchSnapshot();
});

it("transpiles a node template with backslashes", () => {
  expect(node(`Hello, \\world\\!`)).toMatchSnapshot();
});

it("transpiles a sql template", () => {
  expect(sql(`SELECT 1`, {database: "db"})).toMatchSnapshot();
});

it("transpiles a sql template reference a variable database", () => {
  expect(sql(`SELECT 1`, {database: "var:db"})).toMatchSnapshot();
});

it("transpiles a hidden sql template", () => {
  expect(sql(`SELECT 1`, {database: "db", hidden: true})).toMatchSnapshot();
});
