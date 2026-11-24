import type {ReactElement} from "react";
import type {Root as ReactRoot} from "react-dom/client";
import {unprefix} from "../lib/unprefix.js";
import type {Definition} from "./define.js";
import {inspect, inspectError, getExpanded} from "./inspect.js";
import {mapAssets} from "./stdlib/assets.js";
import {ReactDOM} from "./stdlib/recommendedLibraries.js";

export type DisplayMode = "table" | "default";

// React elements are plain objects tagged with a well-known symbol, so they can
// be detected without loading React.
const REACT_ELEMENT = Symbol.for("react.transitional.element");

type ReactState = {
  /** the container element for the React root */
  container: HTMLDivElement;
  /** the React root, once React DOM has loaded; renders are chained in order */
  root: Promise<ReactRoot>;
};

// For each display, the React roots in display order. Roots are reused across
// evaluations of the same variable to preserve component state; a root whose
// container is detached (by clear) is available for reuse.
const reactStatesByDisplay = new WeakMap<DisplayState, ReactState[]>();

export type DisplayState = {
  /** the HTML element in which to render this cell’s display */
  root: HTMLDivElement;
  /** whether to clear on fulfilled */
  autoclear?: boolean;
  /** for inspected values, any expanded paths; see getExpanded */
  expanded: (number[][] | undefined)[];
};

export function display(
  state: DisplayState,
  value: unknown,
  name?: string,
  mode?: DisplayMode
): void {
  return mode === "table"
    ? displayTable(state, value)
    : isReactElement(value)
      ? displayReactElement(state, value)
      : displayDefault(state, value, name);
}

function displayDefault(state: DisplayState, value: unknown, name?: string) {
  const {root, expanded} = state;
  const node = isDisplayable(value, root) ? value : inspect(value, expanded[root.childNodes.length], name); // prettier-ignore
  displayNode(state, node);
}

function displayTable(state: DisplayState, value: unknown) {
  const placeholder = document.createComment("table");
  displayNode(state, placeholder);
  import("./stdlib/inputs.js").then(({table}) => {
    if (!placeholder.parentNode) return; // don’t bother rendering if detached
    placeholder.replaceWith(table(value));
  });
}

function displayReactElement(state: DisplayState, element: ReactElement): void {
  let reactStates = reactStatesByDisplay.get(state);
  if (!reactStates) reactStatesByDisplay.set(state, (reactStates = []));
  let reactState = reactStates.find(({container}) => !container.parentNode);
  if (!reactState) reactStates.push((reactState = createReactState()));
  const {container, root} = reactState;
  displayNode(state, container);
  root.then(
    (root) => {
      if (!container.parentNode) return; // don’t bother rendering if detached
      root.render(element);
    },
    (error) => {
      if (!container.parentNode) return;
      container.replaceWith(inspectError(error)); // detached, so flushed later
    }
  );
}

function createReactState(): ReactState {
  const container = document.createElement("div");
  const root = (ReactDOM() as Promise<typeof import("react-dom/client")>).then(({createRoot}) => createRoot(container)); // prettier-ignore
  return {container, root};
}

function isReactElement(value: unknown): value is ReactElement {
  return typeof value === "object" && value !== null && (value as {$$typeof?: unknown}).$$typeof === REACT_ELEMENT; // prettier-ignore
}

function displayNode(state: DisplayState, node: Node): void {
  if (node.nodeType === 11) {
    let child: ChildNode | null;
    while ((child = node.firstChild)) {
      state.root.appendChild(child);
    }
  } else {
    state.root.appendChild(node);
  }
}

function displayError(state: DisplayState, value: unknown, name?: string): void {
  displayNode(state, inspectError(value, name));
}

// Note: Element.prototype is instanceof Node, but cannot be inserted! This
// excludes DocumentFragment since appending a fragment “dissolves” (mutates)
// the fragment, and we wish for the inspector to not have side-effects.
function isDisplayable(value: unknown, root: HTMLDivElement): value is Node {
  return (
    (value instanceof Element || value instanceof Text) &&
    value instanceof value.constructor &&
    (!value.parentNode || root.contains(value))
  );
}

/**
 * Clears the display. Any displayed React roots are retained so that they can be
 * reused, in order, by subsequent displays of React elements. But if autoclear
 * is set, the display belongs to a new definition (e.g., the cell was edited),
 * so any React roots are unmounted rather than reused.
 */
export function clear(state: DisplayState): void {
  const autocleared = state.autoclear;
  state.autoclear = false;
  state.expanded = Array.from(state.root.childNodes, getExpanded);
  flush(state); // unmount any roots not reused since the previous clear
  if (autocleared) unmountReactStates(state);
  while (state.root.lastChild) state.root.lastChild.remove();
}

/**
 * Unmounts any React roots retained by clear that were not reused. This is safe
 * only once no further displays are expected: after an autodisplay or error, on
 * the next clear, or when the variable is deleted. (Explicit display may be called
 * asynchronously, e.g., by generators or event listeners, so it can’t flush.)
 */
export function flush(state: DisplayState): void {
  unmountReactStates(state, isDetached);
}

function unmountReactStates(
  state: DisplayState,
  test: (reactState: ReactState) => boolean = () => true
): void {
  const reactStates = reactStatesByDisplay.get(state);
  if (!reactStates) return;
  const retainedStates: ReactState[] = [];
  for (const reactState of reactStates) {
    if (test(reactState)) reactState.root.then(unmount, ignore);
    else retainedStates.push(reactState);
  }
  if (retainedStates.length) reactStatesByDisplay.set(state, retainedStates);
  else reactStatesByDisplay.delete(state);
}

export function observe(
  state: DisplayState,
  {autodisplay, assets, output: name, automutable, displayMode: mode}: Definition
) {
  if (automutable && name) name = unprefix(name, "initial ");
  return {
    _error: false,
    _node: state.root, // _node for visibility promise
    pending() {
      if (this._error) {
        this._error = false;
        clear(state);
      }
    },
    fulfilled(value: unknown) {
      if (autodisplay) {
        if (assets && value instanceof Element) mapAssets(value, assets);
        clear(state);
        display(state, value, name, mode);
        flush(state);
      } else if (state.autoclear) {
        clear(state);
        flush(state);
      }
    },
    rejected(error: unknown) {
      console.error(error);
      this._error = true;
      clear(state);
      displayError(state, error, name);
      flush(state);
    }
  };
}

function isDetached({container}: ReactState): boolean {
  return !container.parentNode;
}

function unmount(root: ReactRoot): void {
  root.unmount();
}

function ignore(): void {
  // ignore an error, say
}
