import type {DefineState, Definition} from "./define.js";
import {undefine} from "./define.js";
import {define} from "./index.js";

/** A rendered cell, as exported by the notebook module in the preview server. */
export type HotCell = {
  /** the cell id */
  id: number;
  /** a hash of the cell’s rendered html and definition */
  key: string;
  /** the static HTML for this cell: the cell’s root element, and any pinned source */
  html: string;
  /** the cell’s definition, if not static */
  definition?: Definition;
};

/** The notebook module exported by the preview server. */
export type HotNotebook = {
  /** the document title */
  title: string;
  /** the rendered cells, in order */
  cells: HotCell[];
};

/** A cell’s initial (server-rendered) state: its id, key, and number of top-level nodes. */
export type HotInitialCell = [id: number, key: string, length: number];

type MountedCell = {
  id: number;
  key: string;
  /** the top-level nodes for this cell; the first is the cell’s root */
  nodes: ChildNode[];
  /** the define state, if the cell is defined */
  state?: DefineState;
};

/**
 * Mounts the specified notebook, adopting the server-rendered cells as
 * described by initial, and returns a function that can be used to apply
 * subsequent updates to the notebook. When updating, only cells whose rendered
 * content has changed are redefined; unchanged cells continue running.
 */
export function hot(
  notebook: HotNotebook,
  initial: HotInitialCell[]
): (notebook: HotNotebook) => void {
  let cells: MountedCell[] = [];

  for (const [id, key, length] of initial) {
    const root = document.getElementById(`cell-${id}`);
    if (!root) continue;
    const nodes: ChildNode[] = [root];
    for (let node: ChildNode | null = root; nodes.length < length && (node = node.nextSibling); ) {
      nodes.push(node);
    }
    cells.push({id, key, nodes});
  }

  function update({title, cells: newCells}: HotNotebook): void {
    if (document.title !== title) document.title = title;

    // Determine where cells are inserted; this must happen before removal.
    const first = cells[0]?.nodes[0];
    const parent = first?.parentNode ?? document.querySelector("main") ?? document.body;
    const anchor = first ? first.previousSibling : parent.lastChild;

    // Undefine any old cells that are no longer present.
    const newKeys = new Set(newCells.map((cell) => cell.key));
    const oldCells = new Map(cells.map((cell) => [cell.key, cell]));
    const removed = new Map<number, MountedCell>();
    for (const cell of cells) {
      if (newKeys.has(cell.key)) continue;
      if (cell.state) undefine(cell.state);
      removed.set(cell.id, cell);
    }

    // Compute the new cells, reusing unchanged cells as-is.
    const defines: MountedCell[] = [];
    cells = newCells.map(({id, key, html, definition}) => {
      let cell = oldCells.get(key);
      if (cell) {
        // Server-rendered cells are not yet defined.
        if (definition && !cell.state) defines.push(cell);
        return cell;
      }
      const nodes = parseHtml(html);
      const old = removed.get(id);
      if (old?.state && definition) {
        // When redefining a cell, reuse its root and state to avoid flashing:
        // the old display is retained until the new definition displays.
        removed.delete(id);
        for (const node of old.nodes.slice(1)) node.remove();
        nodes[0] = old.nodes[0];
        cell = {id, key, nodes, state: old.state};
      } else {
        cell = {id, key, nodes};
      }
      if (definition) defines.push(cell);
      return cell;
    });

    // Remove the old cells’ nodes, and insert (or move) the new cells’ nodes.
    for (const cell of removed.values()) {
      for (const node of cell.nodes) node.remove();
    }
    let previous = anchor;
    for (const cell of cells) {
      for (const node of cell.nodes) {
        const next = previous ? previous.nextSibling : parent.firstChild;
        if (node !== next) parent.insertBefore(node, next);
        previous = node;
      }
    }

    // Lastly, define the new cells. This happens synchronously after
    // undefining the old cells so that the runtime only sees the final state.
    const definitions = new Map(newCells.map((cell) => [cell.key, cell.definition]));
    for (const cell of defines) {
      cell.state ??= {root: cell.nodes[0] as HTMLDivElement, expanded: [], variables: []};
      define(cell.state, definitions.get(cell.key)!);
    }
  }

  update(notebook);
  return update;
}

function parseHtml(html: string): ChildNode[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes);
}
