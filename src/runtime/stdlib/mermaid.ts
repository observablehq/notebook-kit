import mer from "https://esm.sh/mermaid";
import type {AsyncRawTemplateRenderer} from "./template.js";

let nextId = 0;
const scheme = getComputedStyle(document.body).getPropertyValue("color-scheme");
const theme = scheme === "dark" ? "dark" : "neutral";
mer.initialize({startOnLoad: false, securityLevel: "loose", theme});

export const mermaid: AsyncRawTemplateRenderer = async (template, ...values) => {
  const source = String.raw.call(String, template, ...values);
  const root = document.createElement("div");
  root.innerHTML = (await mer.render(`mermaid-${++nextId}`, source)).svg;
  return root.removeChild(root.firstChild!);
};
