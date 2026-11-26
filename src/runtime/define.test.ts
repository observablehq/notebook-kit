// @vitest-environment jsdom
import {Runtime} from "@observablehq/runtime";
import {describe, expect, test} from "vitest";
import type {DefineState, Definition} from "./define.js";
import {define, undefine} from "./define.js";

async function until(condition: () => boolean): Promise<void> {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > 1000) throw new Error("timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

describe("undefine", () => {
  test("an undefined variable doesn’t clobber the display of its replacement", async () => {
    const runtime = new Runtime({});
    const main = runtime.module();
    const state: DefineState = {root: document.createElement("div"), variables: [], expanded: []};
    const redefine = (definition: Definition) => {
      undefine(state);
      define(main, state, definition);
    };

    // an expression cell
    redefine({id: 1, body: () => [1, 2, 3], autodisplay: true});
    await until(() => state.root.textContent!.includes("[1, 2, 3]"));

    // to another expression cell; the undefined variable’s final computation
    // (undefined, after its deletion) must not replace the new display
    redefine({id: 1, body: () => [1, 2, 3, 4, 5], autodisplay: true});
    await until(() => state.root.textContent!.includes("[1, 2, 3, 4, 5]"));
    await settle();
    expect(state.root.textContent).toContain("[1, 2, 3, 4, 5]");

    // to a statement cell calling display
    redefine({id: 1, body: (display: (value: unknown) => void) => void display(42), inputs: ["display"]}); // prettier-ignore
    await until(() => state.root.textContent === "42");
    await settle();
    expect(state.root.textContent).toBe("42");

    // and back to an expression cell
    redefine({id: 1, body: () => [1, 2, 3], autodisplay: true});
    await until(() => state.root.textContent!.includes("[1, 2, 3]"));
    await settle();
    expect(state.root.textContent).toContain("[1, 2, 3]");
  });
});
