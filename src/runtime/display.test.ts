// @vitest-environment jsdom
import {useEffect, useState} from "react";
import {jsx} from "react/jsx-runtime";
import {beforeEach, expect, test, vi} from "vitest";
import type {DisplayState} from "./display.js";
import {clear, display, flush} from "./display.js";

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

function Effect({log}: {log: string[]}) {
  useEffect(() => {
    log.push("mount");
    return () => void log.push("unmount");
  }, []);
  return null;
}

test("unmounts React roots when cleared and flushed", async () => {
  const log: string[] = [];
  const s = state();
  display(s, jsx(Effect, {log}));
  await vi.waitFor(() => expect(log).toEqual(["mount"]));
  clear(s);
  expect(s.root.childNodes).toHaveLength(0);
  expect(log).toEqual(["mount"]);
  flush(s);
  await vi.waitFor(() => expect(log).toEqual(["mount", "unmount"]));
});

test("reuses React roots, in order, across clears", async () => {
  function Counter({label}: {label: string}) {
    const [count] = useState(() => Math.random());
    return jsx("i", {children: `${label}:${count}`});
  }
  const s = state();
  display(s, jsx(Counter, {label: "a"}));
  display(s, jsx(Counter, {label: "b"}));
  await vi.waitFor(() => expect(s.root.textContent).toMatch(/^a:.*b:/));
  const [c1, c2] = s.root.childNodes;
  const [t1, t2] = Array.from(s.root.childNodes, (n) => n.textContent!.slice(2));
  clear(s);
  display(s, jsx(Counter, {label: "c"}));
  display(s, jsx(Counter, {label: "d"}));
  flush(s);
  expect(s.root.childNodes[0]).toBe(c1);
  expect(s.root.childNodes[1]).toBe(c2);
  await vi.waitFor(() => expect(s.root.textContent).toBe(`c:${t1}d:${t2}`));
  expect(createRoot).toHaveBeenCalledTimes(2);
});

test("unmounts React roots that are not reused", async () => {
  const log1: string[] = [];
  const log2: string[] = [];
  const s = state();
  display(s, jsx(Effect, {log: log1}));
  display(s, jsx(Effect, {log: log2}));
  await vi.waitFor(() => expect(log2).toEqual(["mount"]));
  clear(s);
  display(s, jsx(Effect, {log: log1}));
  flush(s);
  expect(log1).toEqual(["mount"]);
  await vi.waitFor(() => expect(log2).toEqual(["mount", "unmount"]));
});

test("does not reuse React roots when autoclear is set", async () => {
  const log: string[] = [];
  const s = state();
  display(s, jsx(Effect, {log}));
  await vi.waitFor(() => expect(log).toEqual(["mount"]));
  const container = s.root.firstChild;
  s.autoclear = true; // simulate redefinition
  expect(s.root.firstChild).toBe(container); // retained until cleared
  expect(log).toEqual(["mount"]);
  clear(s);
  await vi.waitFor(() => expect(log).toEqual(["mount", "unmount"]));
  display(s, jsx(Effect, {log}));
  expect(s.root.firstChild).not.toBe(container);
  await vi.waitFor(() => expect(log).toEqual(["mount", "unmount", "mount"]));
  expect(createRoot).toHaveBeenCalledTimes(2);
});

test("renders a reused container cleared before React loads", async () => {
  const s = state();
  display(s, jsx("p", {children: "a"}));
  clear(s);
  display(s, jsx("p", {children: "b"}));
  await vi.waitFor(() => expect(s.root.innerHTML).toBe("<div><p>b</p></div>"));
  expect(createRoot).toHaveBeenCalledTimes(1);
});

test("does not render React elements that are cleared before React loads", async () => {
  const s = state();
  display(s, jsx("p", {}));
  const container = s.root.firstChild as HTMLDivElement;
  clear(s);
  await tick();
  expect(container.innerHTML).toBe("");
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
