import type {Definition} from "./define.js";
import {inspect, inspectError, getExpanded} from "./inspect.js";
import {mapAssets} from "./stdlib/assets.js";

export type DisplayState = {
  /** the HTML element in which to render this cell’s display */
  root: HTMLDivElement;
  /** whether to clear on fulfilled */
  autoclear?: boolean;
  /** for inspected values, any expanded paths; see getExpanded */
  expanded: (number[][] | undefined)[];
};

export function display(state: DisplayState, value: unknown, name?: string): void {
  const {root, expanded} = state;
  const node = isDisplayable(value, root) ? value : inspect(value, expanded[root.childNodes.length], name); // prettier-ignore
  displayNode(state, node);
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

const observers = new WeakMap<DisplayState, unknown>();

export function observe(state: DisplayState, {autodisplay, assets, output}: Definition) {
  const observer = {
    _error: false,
    _node: state.root, // _node for visibility promise
    pending() {
      if (observers.get(state) !== this) return; // stale, e.g., after the cell is redefined
      if (this._error) {
        this._error = false;
        clear(state);
      }
    },
    fulfilled(value: unknown) {
      if (observers.get(state) !== this) return;
      if (autodisplay) {
        if (assets && value instanceof Element) mapAssets(value, assets);
        clear(state);
        display(state, value, output);
      } else if (state.autoclear) {
        clear(state);
      }
    },
    rejected(error: unknown) {
      if (observers.get(state) !== this) return;
      console.error(error);
      this._error = true;
      clear(state);
      displayError(state, error, output);
    }
  };
  observers.set(state, observer);
  return observer;
}
