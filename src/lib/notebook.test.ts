import {assert, test} from "vitest";
import {toCell, toNotebook} from "./notebook.js";

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
