import {expect, it} from "vitest";
import {transpile} from "./transpile.js";

it("transpiles JavaScript expressions", () => {
  expect(transpile("1 + 2", "js")).toMatchSnapshot();
  expect(transpile("x + y", "js")).toMatchSnapshot();
  expect(transpile("await z", "js")).toMatchSnapshot();
  expect(transpile("display(1), display(2)", "js")).toMatchSnapshot();
});

it("transpiles empty cells", () => {
  expect(transpile("", "js")).toMatchSnapshot();
  expect(transpile("", "md")).toMatchSnapshot();
  expect(transpile("", "html")).toMatchSnapshot();
  expect(transpile("", "tex")).toMatchSnapshot();
  expect(transpile("", "sql")).toMatchSnapshot();
});

it("transpiles JavaScript programs", () => {
  expect(transpile("const x = 1, y = 2;", "js")).toMatchSnapshot();
  expect(transpile("x + y;", "js")).toMatchSnapshot();
  expect(transpile("await z;", "js")).toMatchSnapshot();
});

it("transpiles static npm: imports", () => {
  expect(transpile('import * as d3 from "npm:d3";', "js")).toMatchSnapshot();
  expect(transpile('import _ from "npm:lodash";', "js")).toMatchSnapshot();
  expect(transpile('import {} from "npm:d3";\nimport "npm:isoformat";', "js")).toMatchSnapshot();
});

it("transpiles dynamic npm: imports", () => {
  expect(transpile('const d3 = await import("npm:d3");', "js")).toMatchSnapshot();
});

it("transpiles static observable: imports", () => {
  expect(transpile('import {color} from "observable:2d6bf7be248d66f3";', "js")).toMatchSnapshot();
  expect(transpile('import {color} from "observable:2d6bf7be248d66f3@173";', "js")).toMatchSnapshot();
  expect(transpile('import {Scrubber} from "observable:@mbostock/scrubber";', "js")).toMatchSnapshot();
  expect(transpile('import {Scrubber} from "observable:@mbostock/scrubber@255";', "js")).toMatchSnapshot();
  expect(transpile('import {viewof$rotation} from "observable:@rreusser/drawing-3d-objects-with-svg";', "js")).toMatchSnapshot();
});

it("transpiles static imports with {type: 'observable'}", () => {
  expect(transpile('import {color} from "https://api.observablehq.com/d/2d6bf7be248d66f3.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
  expect(transpile('import {color} from "https://api.observablehq.com/d/2d6bf7be248d66f3@173.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
  expect(transpile('import {Scrubber} from "https://api.observablehq.com/@mbostock/scrubber.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
  expect(transpile('import {Scrubber} from "https://api.observablehq.com/@mbostock/scrubber@255.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
  expect(transpile('import {viewof$rotation} from "https://api.observablehq.com/@rreusser/drawing-3d-objects-with-svg.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
});

it("transpiles Observable JavaScript imports", () => {
  expect(transpile('import {color} from "2d6bf7be248d66f3"', "ojs")).toMatchSnapshot();
  expect(transpile('import {color} from "2d6bf7be248d66f3@173"', "ojs")).toMatchSnapshot();
  expect(transpile('import {figure, viewof rotation} from "@rreusser/drawing-3d-objects-with-svg"', "ojs")).toMatchSnapshot();
  expect(transpile('import {figure, viewof rotation as rot} from "@rreusser/drawing-3d-objects-with-svg"', "ojs")).toMatchSnapshot();
});

it("transpiles import.meta.resolve", () => {
  expect(transpile('import.meta.resolve("npm:d3")', "js")).toMatchSnapshot();
  expect(transpile('import.meta.resolve("./test")', "js", {resolveLocalImports: true})).toMatchSnapshot();
  expect(transpile('import.meta.resolve("./test")', "js", {resolveLocalImports: false})).toMatchSnapshot();
});

it("gives a visible sql cell with an output the value of the displayed table, keeping the output name as-is", () => {
  const {autovalue, autodisplay, output, body} = transpile({id: 1, mode: "sql", value: "SELECT 1", output: "result"});
  expect(autodisplay).toBe(true);
  expect(autovalue).toBe(true);
  expect(output).toBe("result"); // not renamed to viewof$result
  expect(body).toContain(".then(Inputs.table)"); // selectable; the output names the selection
});

it("does not set autovalue on a sql cell without an output, and disables row selection", () => {
  const {autovalue, autodisplay, body} = transpile({id: 1, mode: "sql", value: "SELECT 1"});
  expect(autodisplay).toBe(true);
  expect(autovalue).toBe(false);
  expect(body).toContain("Inputs.table(data, {select: false})"); // nothing reads the selection
});

it("does not set autovalue on a hidden sql cell, since it displays no table", () => {
  const {autovalue, autodisplay, output, body} = transpile({id: 1, mode: "sql", value: "SELECT 1", output: "result", hidden: true});
  expect(autodisplay).toBe(false);
  expect(autovalue).toBeFalsy();
  expect(output).toBe("result");
  expect(body).not.toContain("Inputs.table");
});

it("transpiles node cells", () => {
  expect(transpile("process.stdout.write(`Node ${process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node \\${process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node \\\\${process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node $\\{process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node \\$\\{process.version}`);", "node")).toMatchSnapshot();
});
