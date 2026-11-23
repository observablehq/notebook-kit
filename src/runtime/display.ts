import {unprefix} from "../lib/unprefix.js";
import type {Definition} from "./define.js";
import {inspect, inspectError, getExpanded} from "./inspect.js";
import {mapAssets} from "./stdlib/assets.js";
import {ReactDOM} from "./stdlib/recommendedLibraries.js";

export type DisplayMode = "table" | "default";

type ReactRoot = {render(element: unknown): void; unmount(): void};

// React elements are plain objects tagged with a well-known symbol, so they can
// be detected without loading React.
const REACT_ELEMENT = Symbol.for("react.transitional.element");

// The React root rendered into each displayed container, for unmounting on clear.
const reactRoots = new WeakMap<Node, ReactRoot>();

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

function displayReactElement(state: DisplayState, element: unknown): void {
  const container = document.createElement("div");
  displayNode(state, container);
  ReactDOM().then(
    ({createRoot}) => {
      if (!container.parentNode) return; // don’t bother rendering if detached
      const root: ReactRoot = createRoot(container);
      reactRoots.set(container, root);
      root.render(element);
    },
    (error) => {
      if (!container.parentNode) return;
      container.replaceWith(inspectError(error));
    }
  );
}

function isReactElement(value: unknown): boolean {
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

export function clear(state: DisplayState): void {
  state.autoclear = false;
  state.expanded = Array.from(state.root.childNodes, getExpanded);
  for (const child of state.root.childNodes) reactRoots.get(child)?.unmount();
  while (state.root.lastChild) state.root.lastChild.remove();
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
      } else if (state.autoclear) {
        clear(state);
      }
    },
    rejected(error: unknown) {
      console.error(error);
      this._error = true;
      clear(state);
      displayError(state, error, name);
    }
  };
}
