/* eslint-disable @typescript-eslint/no-explicit-any */
import katex from "https://esm.sh/katex";
import type {RawTemplateRenderer} from "./template.js";

const link = document.createElement("link");
link.href = "https://esm.sh/katex/dist/katex.min.css";
link.rel = "stylesheet";
document.head.appendChild(link);

export const tex = Object.assign(renderer(), {
  options: renderer,
  block: renderer({displayMode: true})
});

function renderer(options?: any): RawTemplateRenderer {
  return function (template, ...values) {
    const source = String.raw.call(String, template, ...values);
    const root = document.createElement("div");
    katex.render(source, root, {...options, output: "html"});
    return root.removeChild(root.firstChild!);
  };
}
