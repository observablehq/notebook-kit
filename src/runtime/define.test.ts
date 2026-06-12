// @vitest-environment jsdom
import {Runtime} from "@observablehq/runtime";
import type {Module} from "@observablehq/runtime";
import {expect, it} from "vitest";
import type {DefineState} from "./define.js";
import {define} from "./define.js";
import {library} from "./stdlib/index.js";

function testModule(): Module {
  return new Runtime(library).module();
}

function testState(): DefineState {
  return {root: document.createElement("div"), expanded: [], variables: []};
}

// A view: an element whose value property holds the cell’s logical value.
function numberInput(value: number): HTMLInputElement {
  const element = document.createElement("input");
  element.type = "number";
  element.value = String(value);
  return element;
}

it("defines an ojs viewof cell as both the view element (viewof$x) and its value (x)", async () => {
  const main = testModule();
  define(main, testState(), {
    id: 1,
    body: () => numberInput(42),
    output: "viewof$x",
    autodisplay: true,
    autoview: true
  });
  expect(await main.value("viewof$x")).toBeInstanceOf(HTMLInputElement);
  expect(await main.value("x")).toBe(42);
});

it("defines a sql cell output (autovalue) as the value of its table view, without exposing the view", async () => {
  const main = testModule();
  define(main, testState(), {
    id: 1,
    body: () => numberInput(42), // stands in for the Inputs.table element
    output: "result",
    autodisplay: true,
    autovalue: true
  });
  expect(await main.value("result")).toBe(42);
  await expect(main.value("viewof$result")).rejects.toThrow(/not defined/);
});
