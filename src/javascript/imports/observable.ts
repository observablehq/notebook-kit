import type {ImportAttribute, ImportDeclaration} from "acorn";
import {getImportedName} from "../imports.js";

const CODE_DOLLAR = 36;

/** If specifier is an observable: protocol import, resolves it. */
export function resolveObservableImport(specifier: string): string {
  if (!specifier.startsWith("observable:")) return specifier;
  let path = specifier.slice("observable:".length);
  if (/^[0-9a-f]{16}(@|$)/.test(path)) path = `d/${path}`;
  return `https://api.observablehq.com/${path}.js?v=4`;
}

export function isObservableImport(node: ImportDeclaration, specifier: string): boolean {
  const type = node.attributes?.find((a) => getImportAttributeKey(a) === "type")?.value;
  return type ? type.value === "observable" : specifier.startsWith("observable:");
}

function getImportAttributeKey(node: ImportAttribute): string {
  return node.key.type === "Identifier" ? node.key.name : String(node.key.value);
}

/** Note: mutates inputs! */
export function renderObservableImport(source: string, node: ImportDeclaration, inputs: string[]): string {
  if (!inputs.includes("__ojs_runtime")) inputs.push("__ojs_runtime");
  if (!inputs.includes("__ojs_observer")) inputs.push("__ojs_observer");
  return `(import(${JSON.stringify(source)}).then((_) => {
  const observers = {};
  const module = __ojs_runtime.module(_.default);
  const main = __ojs_runtime.module();${node.specifiers
    .map((specifier) => {
      if (specifier.type === "ImportNamespaceSpecifier") throw new SyntaxError("observable namespace imports are not supported");
      const iname = getImportedName(specifier);
      const vname = dedollar(iname);
      return `
  if (!module.defines("${vname}")) throw new SyntaxError(\`export '${vname}' not found\`);
  main.variable(observers.${iname} = __ojs_observer()).import("${vname}", module);`;
    })
    .join("")}
  return observers;
}))`;
}

/** Turns e.g. "viewof$foo" into "viewof foo", and "$$" into "$". */
export function dedollar(input: string): string {
  const start = 0;
  const end = input.length;
  let dollars = 0;
  for (let i = start; i < end; ++i) {
    switch (input.charCodeAt(i)) {
      case CODE_DOLLAR: {
        ++dollars;
        break;
      }
      default: {
        if (dollars > 0) {
          input = `${input.slice(0, i - 1)}${dollars === 1 ? " " : ""}${input.slice(i)}`;
          dollars = 0;
        }
        break;
      }
    }
  }
  if (dollars > 0) {
    input = `${input.slice(0, end - 1)}${dollars === 1 ? " " : ""}`;
    dollars = 0;
  }
  return input;
}
