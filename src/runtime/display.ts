import type {Definition} from "./define.js";
import {inspect, inspectError, getExpanded} from "./inspect.js";
import {mapAssets} from "./stdlib/assets.js";

export type DisplayMode = "table" | "default";

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
  return mode === "table" ? displayTable(state, value) : displayDefault(state, value, name);
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
  while (state.root.lastChild) state.root.lastChild.remove();
}

export function observe(
  state: DisplayState,
  {autodisplay, assets, output: name, displayMode: mode}: Definition
) {
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
