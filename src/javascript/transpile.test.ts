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

it("transpiles TypeScript expressions", () => {
  expect(transpile("1 + 2 as number", "ts")).toMatchSnapshot();
  expect(transpile("1, 2 as number", "ts")).toMatchSnapshot();
  expect(transpile("1, 2 as number // comment", "ts")).toMatchSnapshot();
  expect(transpile("(1!)!, (2 as number)", "ts")).toMatchSnapshot();
  expect(transpile("(1 + 2) as number", "ts")).toMatchSnapshot();
  expect(transpile("{x: 42 as number}", "ts")).toMatchSnapshot();
  expect(transpile("({x: 42 as number})", "ts")).toMatchSnapshot();
});

it("transpiles TypeScript function expressions", () => {
  expect(transpile("function foo(): void {}", "ts")).toMatchSnapshot();
});

it("transpiles TypeScript class expressions", () => {
  expect(transpile("class Foo {}", "ts")).toMatchSnapshot();
});

it("transpiles TypeScript statements", () => {
  expect(transpile("1 + 2!;", "ts")).toMatchSnapshot();
  expect(transpile("1, 2 as number;", "ts")).toMatchSnapshot();
  expect(transpile("(1), (2 as number);", "ts")).toMatchSnapshot();
  expect(transpile("(1 + 2) as number;", "ts")).toMatchSnapshot();
  expect(transpile("{x: 42 as number};", "ts")).toMatchSnapshot();
  expect(transpile("({x: 42 as number});", "ts")).toMatchSnapshot();
});

it("transpiles TypeScript imports", () => {
  expect(transpile('import {foo} from "npm:bar";', "ts")).toMatchSnapshot();
  expect(transpile('import {type foo} from "npm:bar";', "ts")).toMatchSnapshot(); // TODO should be stripped
  expect(transpile('import type {foo} from "npm:bar";', "ts")).toMatchSnapshot(); // TODO should be stripped
});

it("throws SyntaxError on invalid TypeScript syntax", () => {
  expect(() => transpile("1) + 2", "ts")).toThrow(SyntaxError);
  expect(() => transpile("(1 + 2", "ts")).toThrow(SyntaxError);
  expect(() => transpile("1 + 2 /* comment", "ts")).toThrow(SyntaxError);
});

it("transpiles TypeScript programs", () => {
  expect(transpile("const x: number = 1, y: string = `hello`;", "ts")).toMatchSnapshot();
  expect(transpile("x + (y as number);", "ts")).toMatchSnapshot();
  expect(transpile("type strumber = string | number;", "ts")).toMatchSnapshot();
  expect(transpile("const sum = (a: number, b: number) => a + b;", "ts")).toMatchSnapshot();
  expect(transpile("interface Point { x: number; y: number; }", "ts")).toMatchSnapshot();
  expect(transpile("declare function foo(x: number): void;", "ts")).toMatchSnapshot();
  expect(transpile("class Dict { [key: string]: number; }", "ts")).toMatchSnapshot();
  expect(
    transpile("class C { m(x: number): void; m(x: string) { display(x); } }", "ts")
  ).toMatchSnapshot();
});

it("strips TypeScript type syntax", () => {
  expect(transpile("x satisfies Foo;", "ts")).toMatchSnapshot();
  expect(transpile("obj!.value;", "ts")).toMatchSnapshot();
  expect(transpile("(<string>value);", "ts")).toMatchSnapshot();
  expect(transpile("identity<number>(42);", "ts")).toMatchSnapshot();
  expect(transpile("new Map<string, number>();", "ts")).toMatchSnapshot();
  expect(transpile("function f<T>(a: T, b?: string): T { return a; }", "ts")).toMatchSnapshot();
  expect(transpile("let v!: number;", "ts")).toMatchSnapshot();
  expect(transpile("const obj: {a: number; b: string} = {a: 1, b: 2};", "ts")).toMatchSnapshot();
  expect(
    transpile(
      "abstract class A extends B<number> implements I { abstract m(): void; private readonly p: number = 1; static s = 2; q?: string; }",
      "ts"
    )
  ).toMatchSnapshot();
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
  expect(
    transpile('import {color} from "observable:2d6bf7be248d66f3@173";', "js")
  ).toMatchSnapshot();
  expect(
    transpile('import {Scrubber} from "observable:@mbostock/scrubber";', "js")
  ).toMatchSnapshot();
  expect(
    transpile('import {Scrubber} from "observable:@mbostock/scrubber@255";', "js")
  ).toMatchSnapshot();
  expect(
    transpile(
      'import {viewof$rotation} from "observable:@rreusser/drawing-3d-objects-with-svg";',
      "js"
    )
  ).toMatchSnapshot();
});

it("does not allow namespace observable: imports", () => {
  expect(() => transpile('import * as foo from "observable:2d6bf7be248d66f3";', "js")).toThrow(
    /namespace specifier/
  );
  expect(() => transpile('import * as foo from "2d6bf7be248d66f3";', "ojs")).toThrow(
    /unexpected token/i
  );
});

it("transpiles static imports with {type: 'observable'}", () => {
  expect(
    transpile(
      'import {color} from "https://api.observablehq.com/d/2d6bf7be248d66f3.js?v=4" with {type: "observable"};',
      "js"
    )
  ).toMatchSnapshot();
  expect(
    transpile(
      'import {color} from "https://api.observablehq.com/d/2d6bf7be248d66f3@173.js?v=4" with {type: "observable"};',
      "js"
    )
  ).toMatchSnapshot();
  expect(
    transpile(
      'import {Scrubber} from "https://api.observablehq.com/@mbostock/scrubber.js?v=4" with {type: "observable"};',
      "js"
    )
  ).toMatchSnapshot();
  expect(
    transpile(
      'import {Scrubber} from "https://api.observablehq.com/@mbostock/scrubber@255.js?v=4" with {type: "observable"};',
      "js"
    )
  ).toMatchSnapshot();
  expect(
    transpile(
      'import {viewof$rotation} from "https://api.observablehq.com/@rreusser/drawing-3d-objects-with-svg.js?v=4" with {type: "observable"};',
      "js"
    )
  ).toMatchSnapshot();
});

it("transpiles Observable JavaScript imports", () => {
  expect(transpile('import {color} from "2d6bf7be248d66f3"', "ojs")).toMatchSnapshot();
  expect(transpile('import {color} from "2d6bf7be248d66f3@173"', "ojs")).toMatchSnapshot();
});

it("transpiles Observable JavaScript imports of views", () => {
  expect(
    transpile(
      'import {figure, viewof rotation} from "@rreusser/drawing-3d-objects-with-svg"',
      "ojs"
    )
  ).toMatchSnapshot();
  expect(
    transpile(
      'import {figure, viewof rotation as rot} from "@rreusser/drawing-3d-objects-with-svg"',
      "ojs"
    )
  ).toMatchSnapshot();
});

it("transpiles Observable JavaScript imports of mutables", () => {
  expect(transpile('import {mutable foo} from "2d6bf7be248d66f3"', "ojs")).toMatchSnapshot();
  expect(transpile('import {mutable foo as bar} from "2d6bf7be248d66f3"', "ojs")).toMatchSnapshot();
});

it("transpiles Observable JavaScript import-withs", () => {
  expect(transpile('import {color} with {} from "2d6bf7be248d66f3"', "ojs")).toMatchSnapshot();
  expect(transpile('import {color} with {foo} from "2d6bf7be248d66f3"', "ojs")).toMatchSnapshot();
  expect(
    transpile('import {color} with {foo as bar} from "2d6bf7be248d66f3"', "ojs")
  ).toMatchSnapshot();
  expect(
    transpile('import {color as red} with {foo} from "2d6bf7be248d66f3"', "ojs")
  ).toMatchSnapshot();
});

it("transpiles Observable JavaScript import-withs of views and mutables", () => {
  expect(
    transpile('import {viewof color} with {foo as bar} from "2d6bf7be248d66f3"', "ojs")
  ).toMatchSnapshot();
  expect(
    transpile('import {color} with {viewof foo} from "2d6bf7be248d66f3"', "ojs")
  ).toMatchSnapshot();
  expect(
    transpile('import {color} with {viewof foo as bar} from "2d6bf7be248d66f3"', "ojs")
  ).toMatchSnapshot();
  expect(
    transpile('import {color} with {mutable foo} from "2d6bf7be248d66f3"', "ojs")
  ).toMatchSnapshot();
  expect(
    transpile('import {color} with {mutable foo as bar} from "2d6bf7be248d66f3"', "ojs")
  ).toMatchSnapshot();
  expect(
    transpile(
      'import {color} with {foo, viewof bar, mutable baz as qux} from "2d6bf7be248d66f3"',
      "ojs"
    )
  ).toMatchSnapshot();
});

it("transpiles Observable JavaScript dynamic imports", () => {
  expect(transpile('import("d3")', "ojs")).toMatchSnapshot();
  expect(transpile('import("d3@7")', "ojs")).toMatchSnapshot();
  expect(transpile('import("@observablehq/plot")', "ojs")).toMatchSnapshot();
  expect(transpile('import("lodash/fp")', "ojs")).toMatchSnapshot();
  expect(
    transpile('import("three@0.150.1/examples/jsm/controls/OrbitControls.js")', "ojs")
  ).toMatchSnapshot();
  expect(transpile('import("leaflet/dist/leaflet.css")', "ojs")).toMatchSnapshot();
});

it("ignores non-bare Observable JavaScript dynamic imports", () => {
  expect(transpile('import("./local.js")', "ojs")).toMatchSnapshot();
  expect(transpile('import("../sibling.js")', "ojs")).toMatchSnapshot();
  expect(transpile('import("/abs.js")', "ojs")).toMatchSnapshot();
  expect(transpile('import("https://cdn.skypack.dev/canvas-confetti")', "ojs")).toMatchSnapshot();
  expect(transpile('import("npm:d3")', "ojs")).toMatchSnapshot();
});

it("transpiles import.meta.resolve", () => {
  expect(transpile('import.meta.resolve("npm:d3")', "js")).toMatchSnapshot();
  expect(
    transpile('import.meta.resolve("./test")', "js", {resolveLocalImports: true})
  ).toMatchSnapshot();
  expect(
    transpile('import.meta.resolve("./test")', "js", {resolveLocalImports: false})
  ).toMatchSnapshot();
});

it("transpiles node cells", () => {
  expect(transpile("process.stdout.write(`Node ${process.version}`);", "node")).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node \\${process.version}`);", "node")).toMatchSnapshot();
  expect(
    transpile("process.stdout.write(`Node \\\\${process.version}`);", "node")
  ).toMatchSnapshot();
  expect(transpile("process.stdout.write(`Node $\\{process.version}`);", "node")).toMatchSnapshot();
  expect(
    transpile("process.stdout.write(`Node \\$\\{process.version}`);", "node")
  ).toMatchSnapshot();
});
