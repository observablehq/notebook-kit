// @vitest-environment jsdom
import {afterEach, beforeEach, expect, test, vi} from "vitest";
import type {HotCell, HotNotebook} from "./hot.js";
import {hot} from "./hot.js";

let calls: Record<string, number>;
let update: ((notebook: HotNotebook) => void) | undefined;

beforeEach(() => {
  calls = {};
  document.title = "Test";
  document.body.innerHTML = `<main><p id="before"></p></main>`;
});

// All tests share the default runtime, so undefine everything after each test.
afterEach(async () => {
  update?.({title: "Test", cells: []});
  update = undefined;
  await tick();
});

function count(name: string): void {
  calls[name] = (calls[name] ?? 0) + 1;
}

function cellHtml(id: number, content = "", pinned?: string): string {
  return `<div id="cell-${id}" class="observablehq observablehq--cell">${content}</div>${
    pinned ? `<pre><code>${pinned}</code></pre>` : ""
  }`;
}

function staticCell(id: number, content: string): HotCell {
  return {id, key: `${id}:${content}`, html: cellHtml(id, content)};
}

function constCell(id: number, name: string, value: number, pinned?: string): HotCell {
  return {
    id,
    key: `${id}:${name}=${value}:${pinned}`,
    html: cellHtml(id, "", pinned),
    definition: {
      id,
      body: () => (count(`${name}=${value}`), {[name]: value}),
      inputs: [],
      outputs: [name],
      autodisplay: false
    }
  };
}

function exprCell(id: number, input: string, offset: number): HotCell {
  return {
    id,
    key: `${id}:${input}+${offset}`,
    html: cellHtml(id),
    definition: {
      id,
      body: (value: number) => (count(`${input}+${offset}`), value + offset),
      inputs: [input],
      autodisplay: true
    }
  };
}

/** Server-renders the given cells into main, returning the initial state. */
function mount(notebook: HotNotebook) {
  const main = document.querySelector("main")!;
  main.insertAdjacentHTML("beforeend", notebook.cells.map((cell) => cell.html).join(""));
  const initial = notebook.cells.map(({id, key, html}) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    return [id, key, template.content.childNodes.length] as [number, string, number];
  });
  return (update = hot(notebook, initial));
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

function text(id: number): string | null {
  return document.getElementById(`cell-${id}`)!.textContent;
}

function ids(): string[] {
  return Array.from(document.querySelector("main")!.children, (e) => e.id || e.tagName);
}

test("hot adopts server-rendered cells and defines them", async () => {
  const pre = "const x = 1;";
  mount({title: "Test", cells: [staticCell(1, "Hello"), constCell(2, "x", 1, pre), exprCell(3, "x", 1)]}); // prettier-ignore
  await tick();
  expect(ids()).toEqual(["before", "cell-1", "cell-2", "PRE", "cell-3"]);
  expect(text(1)).toBe("Hello");
  expect(text(3)).toBe("2");
  expect(calls).toEqual({"x=1": 1, "x+1": 1});
});

test("hot only redefines changed cells", async () => {
  const update = mount({title: "Test", cells: [constCell(1, "x", 1), exprCell(2, "x", 1)]});
  await tick();
  const root = document.getElementById("cell-2");
  update({title: "Test", cells: [constCell(1, "x", 1), exprCell(2, "x", 2)]});
  await tick();
  expect(text(2)).toBe("3");
  expect(calls).toEqual({"x=1": 1, "x+1": 1, "x+2": 1});
  expect(document.getElementById("cell-2")).toBe(root); // root is reused
});

test("hot recomputes downstream cells when an upstream cell changes", async () => {
  const update = mount({title: "Test", cells: [constCell(1, "x", 1), exprCell(2, "x", 1)]});
  await tick();
  update({title: "Test", cells: [constCell(1, "x", 10), exprCell(2, "x", 1)]});
  await tick();
  expect(text(2)).toBe("11");
  expect(calls).toEqual({"x=1": 1, "x+1": 2, "x=10": 1});
});

test("hot handles a variable moving to a different cell", async () => {
  const update = mount({title: "Test", cells: [constCell(1, "x", 1), exprCell(2, "x", 1)]});
  await tick();
  update({title: "Test", cells: [exprCell(2, "x", 1), constCell(3, "x", 5)]});
  await tick();
  expect(ids()).toEqual(["before", "cell-2", "cell-3"]);
  expect(text(2)).toBe("6");
});

test("hot inserts, removes, and reorders cells", async () => {
  const update = mount({title: "Test", cells: [staticCell(1, "a"), staticCell(2, "b"), constCell(3, "x", 1, "x")]}); // prettier-ignore
  const node2 = document.getElementById("cell-2");
  update({title: "Test", cells: [constCell(3, "x", 1, "x"), staticCell(4, "d"), staticCell(2, "b")]}); // prettier-ignore
  await tick();
  expect(ids()).toEqual(["before", "cell-3", "PRE", "cell-4", "cell-2"]);
  expect(document.getElementById("cell-2")).toBe(node2); // unchanged nodes are moved, not replaced
  expect(text(4)).toBe("d");
  update({title: "Test", cells: [staticCell(2, "B"), constCell(3, "x", 1)]});
  await tick();
  expect(ids()).toEqual(["before", "cell-2", "cell-3"]);
  expect(text(2)).toBe("B");
  expect(calls).toEqual({"x=1": 2}); // redefined because the pinned source changed
});

test("hot displays an error when a referenced variable is removed", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const update = mount({title: "Test", cells: [constCell(1, "x", 1), exprCell(2, "x", 1)]});
    await tick();
    update({title: "Test", cells: [exprCell(2, "x", 1)]});
    await tick();
    expect(text(2)).toMatch(/x is not defined/);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({message: "x is not defined"}));
  } finally {
    error.mockRestore();
  }
});

test("hot redefines cells that use display and view", async () => {
  function displayCell(id: number, message: string): HotCell {
    return {
      id,
      key: `${id}:${message}`,
      html: cellHtml(id),
      definition: {
        id,
        body: (display: (value: unknown) => void, view: (value: unknown) => unknown) => {
          display(document.createTextNode(message));
          const input = document.createElement("input");
          input.value = message;
          return {v: view(input)};
        },
        inputs: ["display", "view"],
        outputs: ["v"]
      }
    };
  }
  const textCell: HotCell = {
    id: 2,
    key: "2",
    html: cellHtml(2),
    definition: {id: 2, body: (v: string) => document.createTextNode(v), inputs: ["v"], autodisplay: true} // prettier-ignore
  };
  const update = mount({title: "Test", cells: [displayCell(1, "one"), textCell]});
  await tick();
  expect(text(1)).toBe("one");
  expect(text(2)).toBe("one");
  update({title: "Test", cells: [displayCell(1, "two"), textCell]});
  await tick();
  expect(text(1)).toBe("two");
  expect(text(2)).toBe("two");
});

test("hot updates the document title", async () => {
  const update = mount({title: "Test", cells: []});
  update({title: "Updated", cells: [staticCell(1, "a")]});
  expect(document.title).toBe("Updated");
  expect(ids()).toEqual(["before", "cell-1"]);
});
