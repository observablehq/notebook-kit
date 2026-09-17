import {instance} from "https://cdn.jsdelivr.net/npm/@viz-js/viz/+esm";
import type {RawTemplateRenderer} from "./template.js";

const viz = await instance();

const theme = {
  color: "#00000101",
  fontcolor: "#00000101",
  fontname: "var(--sans-serif)",
  fontsize: "12"
};

export const dot: RawTemplateRenderer = (template, ...values) => {
  const source = String.raw.call(String, template, ...values);
  const svg: SVGSVGElement = viz.renderSVGElement(source, {
    graphAttributes: {bgcolor: "none", ...theme},
    nodeAttributes: theme,
    edgeAttributes: theme
  });
  for (const e of svg.querySelectorAll("[stroke='#000001'][stroke-opacity='0.003922']")) {
    e.setAttribute("stroke", "currentColor");
    e.removeAttribute("stroke-opacity");
  }
  for (const e of svg.querySelectorAll("[fill='#000001'][fill-opacity='0.003922']")) {
    e.setAttribute("fill", "currentColor");
    e.removeAttribute("fill-opacity");
  }
  svg.remove();
  svg.style = "max-width: 100%; height: auto;";
  return svg;
};
