import {expect, it} from "vitest";
import {transpile} from "./transpile.js";

it("transpiles JavaScript expressions", async () => {
  expect(transpile("1 + 2", "js")).toMatchSnapshot();
  expect(transpile("1 + 2", "js", {concreteBody: true}).body()).toEqual(3);
  expect(transpile("x + y", "js")).toMatchSnapshot();
  expect(transpile("x + y", "js", {concreteBody: true}).body(3, 5)).toEqual(8);
  expect(transpile("await z", "js")).toMatchSnapshot();
  expect(await transpile("await z", "js", {concreteBody: true}).body(Promise.resolve(7))).toEqual(7);
  expect(transpile("display(1), display(2)", "js")).toMatchSnapshot();
});

it("transpiles JavaScript programs", async () => {
  expect(transpile("const x = 1, y = 2;", "js")).toMatchSnapshot();
  expect(transpile("const x = 1, y = 2;", "js", {concreteBody: true}).body()).toEqual({x: 1, y: 2});
  expect(transpile("x + y;", "js")).toMatchSnapshot();
  expect(transpile("await z;", "js")).toMatchSnapshot();
  expect(await transpile("await z", "js", {concreteBody: true}).body(Promise.resolve(7))).toEqual(7);
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
  expect(transpile('import {Scrubber} from "observable:@mbostock/scrubber";', "js")).toMatchSnapshot();
  expect(transpile('import {viewof$rotation} from "observable:@rreusser/drawing-3d-objects-with-svg";', "js")).toMatchSnapshot();
});

it("transpiles static imports with {type: 'observable'}", () => {
  expect(transpile('import {Scrubber} from "https://api.observablehq.com/@mbostock/scrubber.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
  expect(transpile('import {viewof$rotation} from "https://api.observablehq.com/@rreusser/drawing-3d-objects-with-svg.js?v=4" with {type: "observable"};', "js")).toMatchSnapshot();
});

it("transpiles Observable JavaScript imports", () => {
  expect(transpile('import {figure, viewof rotation} from "@rreusser/drawing-3d-objects-with-svg"', "ojs")).toMatchSnapshot();
  expect(transpile('import {figure, viewof rotation as rot} from "@rreusser/drawing-3d-objects-with-svg"', "ojs")).toMatchSnapshot();
});

it("transpiles import.meta.resolve", () => {
  expect(transpile('import.meta.resolve("npm:d3")', "js")).toMatchSnapshot();
  expect(transpile('import.meta.resolve("npm:d3")', "js",{concreteBody: true}).body()).toEqual("https://cdn.jsdelivr.net/npm/d3/+esm");
  expect(transpile('import.meta.resolve("./test")', "js", {resolveLocalImports: true})).toMatchSnapshot();
  expect(transpile('import.meta.resolve("./test")', "js", {resolveLocalImports: false})).toMatchSnapshot();
  expect(transpile('import.meta.resolve("./test")', "js",{resolveLocalImports: false, concreteBody: true}).body()).toEqual("./test");
});

