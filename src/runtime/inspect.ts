import {Inspector} from "@observablehq/inspector";

export function inspect(value: unknown, expanded?: number[][], name?: string): HTMLDivElement {
  const node = document.createElement("div");
  new Inspector(node).fulfilled(value, name);
  if (expanded) {
    for (const path of expanded) {
      let child: ChildNode = node;
      for (const i of path) child = child?.childNodes[i];
      child?.dispatchEvent(new Event("mouseup")); // restore expanded state
    }
  }
  return node;
}

export function inspectError(value: unknown, name?: string): HTMLDivElement {
  const node = document.createElement("div");
  new Inspector(node).rejected(value, name);
  return node;
}

export function getExpanded(node: Node): number[][] | undefined {
  if (!isInspector(node)) return;
  const expanded = node.querySelectorAll(".observablehq--expanded");
  if (expanded.length) return Array.from(expanded, (e) => getNodePath(node, e));
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isInspector(node: Node): node is HTMLDivElement {
  return isElement(node) && node.classList.contains("observablehq");
}

function getNodePath(node: Node, descendant: Node): number[] {
  const path: number[] = [];
  while (descendant !== node) {
    path.push(getChildIndex(descendant));
    descendant = descendant.parentNode!;
  }
  return path.reverse();
}

function getChildIndex(node: Node): number {
  return Array.prototype.indexOf.call(node.parentNode!.childNodes, node);
}
