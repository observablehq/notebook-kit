// @vitest-environment jsdom
import {useEffect, useState} from "react";
import {jsx} from "react/jsx-runtime";
import {beforeEach, expect, test, vi} from "vitest";
import type {DisplayState} from "./display.js";
import {clear, display} from "./display.js";

const {createRoot} = vi.hoisted(() => ({createRoot: vi.fn()}));

// The runtime loads React DOM from npm, which isn't available in tests, so
// substitute the installed react-dom (spying on createRoot).
vi.mock("./stdlib/recommendedLibraries.js", () => ({
  ReactDOM: async () => {
    const client = await import("react-dom/client");
    return {createRoot: createRoot.mockImplementation(client.createRoot)};
  }
}));

function state(): DisplayState {
  return {root: document.createElement("div"), expanded: []};
}

// Waits for React DOM to load, and then for any pending renders.
async function tick() {
  await import("react-dom/client");
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  createRoot.mockClear();
});

test("renders React elements into a container using a React root", async () => {
  const s = state();
  display(s, jsx("p", {children: "hello"}));
  expect(s.root.childNodes).toHaveLength(1);
  const container = s.root.firstChild as HTMLDivElement;
  expect(container.tagName).toBe("DIV");
  await vi.waitFor(() => expect(container.innerHTML).toBe("<p>hello</p>"));
  expect(createRoot).toHaveBeenCalledExactlyOnceWith(container);
});

test("renders components that use hooks", async () => {
  function Counter({initial}: {initial: number}) {
    const [count] = useState(initial);
    return jsx("b", {children: count});
  }
  const s = state();
  display(s, jsx(Counter, {initial: 42}));
  await vi.waitFor(() => expect(s.root.innerHTML).toBe("<div><b>42</b></div>"));
});

test("renders each displayed React element into its own root", async () => {
  const s = state();
  display(s, jsx("i", {children: "a"}));
  display(s, jsx("i", {children: "b"}));
  await vi.waitFor(() => expect(s.root.innerHTML).toBe("<div><i>a</i></div><div><i>b</i></div>"));
  expect(createRoot).toHaveBeenCalledTimes(2);
});

test("unmounts React roots when cleared", async () => {
  let mounted = false;
  function Effect() {
    useEffect(() => {
      mounted = true;
      return () => void (mounted = false);
    }, []);
    return null;
  }
  const s = state();
  display(s, jsx(Effect, {}));
  await vi.waitFor(() => expect(mounted).toBe(true));
  clear(s);
  expect(mounted).toBe(false);
  expect(s.root.childNodes).toHaveLength(0);
});

test("does not render React elements that are cleared before React loads", async () => {
  const s = state();
  display(s, jsx("p", {}));
  clear(s);
  await tick();
  expect(createRoot).not.toHaveBeenCalled();
});

test("does not treat other objects with $$typeof as React elements", async () => {
  const s = state();
  display(s, {$$typeof: Symbol.for("react.element"), type: "p", props: {}});
  display(s, {$$typeof: "react.transitional.element"});
  await tick();
  expect(createRoot).not.toHaveBeenCalled();
  expect(s.root.childNodes).toHaveLength(2);
});

test("still displays DOM nodes directly", () => {
  const s = state();
  const p = document.createElement("p");
  display(s, p);
  expect(s.root.firstChild).toBe(p);
});
