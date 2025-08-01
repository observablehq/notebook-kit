import slugify from "@sindresorhus/slugify";
import MarkdownIt from "markdown-it";
import MarkdownItAnchor from "markdown-it-anchor";
import type {TemplateRenderer} from "./template.js";

const mi = MarkdownIt({html: true, linkify: true, typographer: true});

mi.use(MarkdownItAnchor, {
  level: [2, 3],
  slugify: (s) => slugify(s),
  permalink: MarkdownItAnchor.permalink.headerLink({class: ""})
});

export function MarkdownRenderer({
  document = window.document
}: {
  document?: Document;
} = {}): TemplateRenderer<HTMLElement> {
  return function (template, ...values) {
    let source = template[0];
    let fragment: DocumentFragment | null = null;
    let partIndex = -1;
    const parts: Node[] = [];

    // Concatenate the text using comments as placeholders.
    for (let i = 0, n = values.length; i < n; ++i) {
      const value = values[i];
      if (value instanceof Node) {
        parts[++partIndex] = value;
        source += `<!--o:${partIndex}-->`;
      } else if (Array.isArray(value)) {
        for (const node of value) {
          if (node instanceof Node) {
            if (fragment === null) {
              parts[++partIndex] = fragment = document.createDocumentFragment();
              source += `<!--o:${partIndex}-->`;
            }
            fragment.appendChild(node);
          } else {
            fragment = null;
            source += node;
          }
        }
        fragment = null;
      } else {
        source += value;
      }
      source += template[i + 1];
    }

    // Render the text.
    const root = document.createElement("div");
    root.innerHTML = mi.render(source);

    // Walk the rendered content to replace comment placeholders.
    if (++partIndex > 0) {
      const nodes = new Array<Comment>(partIndex);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT, null);
      while (walker.nextNode()) {
        const node = walker.currentNode as Comment;
        if (/^o:\d+$/.test(node.nodeValue!)) {
          nodes[+node.nodeValue!.slice(2)] = node;
        }
      }
      for (let i = 0; i < partIndex; ++i) {
        const node = nodes[i];
        node.parentNode?.replaceChild(parts[i], node);
      }
    }

    return root;
  };
}

let renderer: TemplateRenderer<HTMLElement> | undefined;

export const md: TemplateRenderer = (template, ...values) => {
  const root = (renderer ??= MarkdownRenderer())(template, ...values);
  const codes = root.querySelectorAll<HTMLElement>("code[class^=language-]");
  if (codes.length > 0) import("./highlight.js").then(({highlight}) => codes.forEach(highlight));
  return root.childNodes.length === 1 ? root.removeChild(root.firstChild!) : root;
};
