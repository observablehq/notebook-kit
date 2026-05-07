import {assert, test} from "vitest";
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

test("themeImports returns a single @import for a single theme", () => {
  assert.strictEqual(themeImports("air"), `@import url("observable:styles/theme-air.css");`);
});

test("themeImports wraps a light-dark pair in prefers-color-scheme queries", () => {
  const paired = `@import url("observable:styles/theme-air.css") (prefers-color-scheme: light);
@import url("observable:styles/theme-near-midnight.css") (prefers-color-scheme: dark);`;
  // Note: ignores whitespace
  assert.strictEqual(themeImports("light-dark(air,near-midnight)"), paired);
  // A user might want to display a dark theme in a light context, and vice versa.
  const inverted = `@import url("observable:styles/theme-coffee.css") (prefers-color-scheme: light);
@import url("observable:styles/theme-cotton.css") (prefers-color-scheme: dark);`;
  assert.strictEqual(themeImports("light-dark(coffee, cotton)"), inverted);
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
