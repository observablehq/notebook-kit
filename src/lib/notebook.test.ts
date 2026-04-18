import {assert, test} from "vitest";
import type {NotebookTheme} from "./notebook.js";
import {themeImports, toCell, toNotebook} from "./notebook.js";

test("converts a notebook spec to a notebook", () => {
  assert.deepStrictEqual(toNotebook({}), {
    title: "Untitled",
    theme: "air",
    cells: [],
    readOnly: false
  });
});

test("converts a cell spec to a cell", () => {
  assert.deepStrictEqual(toCell({id: 1}), {
    id: 1,
    value: "",
    mode: "js",
    pinned: true,
    hidden: false,
    format: undefined,
    output: undefined,
    database: undefined,
    since: undefined
  });
});

test("accepts an array of themes", () => {
  assert.deepStrictEqual(toNotebook({theme: ["air", "near-midnight"]}), {
    title: "Untitled",
    theme: ["air", "near-midnight"],
    cells: [],
    readOnly: false
  });
});

test("themeImports returns a single @import for a single theme", () => {
  assert.strictEqual(
    themeImports("air"),
    `@import url("observable:styles/theme-air.css");`
  );
});

test("themeImports wraps each paired theme in a prefers-color-scheme query", () => {
  assert.strictEqual(
    themeImports(["air", "near-midnight"]),
    `@import url("observable:styles/theme-air.css") (prefers-color-scheme: light);
@import url("observable:styles/theme-near-midnight.css") (prefers-color-scheme: dark);`
  );
});

test("themeImports ignores the order of the light/dark pair", () => {
  assert.strictEqual(
    themeImports(["near-midnight", "air"]),
    `@import url("observable:styles/theme-near-midnight.css") (prefers-color-scheme: dark);
@import url("observable:styles/theme-air.css") (prefers-color-scheme: light);`
  );
});

test("themeImports treats a modifier theme (not in themeScheme) as scheme-agnostic", () => {
  // `wide` is not a real theme yet; this documents the intended behavior
  // for future modifier themes that change layout but not color scheme.
  assert.strictEqual(
    themeImports(["air", "near-midnight", "wide" as NotebookTheme]),
    `@import url("observable:styles/theme-air.css") (prefers-color-scheme: light);
@import url("observable:styles/theme-near-midnight.css") (prefers-color-scheme: dark);
@import url("observable:styles/theme-wide.css");`
  );
});

test("themeImports does not wrap when both themes share a scheme", () => {
  assert.strictEqual(
    themeImports(["slate", "near-midnight"]),
    `@import url("observable:styles/theme-slate.css");
@import url("observable:styles/theme-near-midnight.css");`
  );
});

test("computes an appropriate default pinned based on the cell mode", () => {
  assert.deepStrictEqual(toCell({id: 1, mode: "md"}), {
    id: 1,
    value: "",
    mode: "md",
    pinned: false,
    hidden: false,
    format: undefined,
    output: undefined,
    database: undefined,
    since: undefined
  });
});
