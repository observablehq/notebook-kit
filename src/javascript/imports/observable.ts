import type {ImportWithDeclaration} from "@observablehq/parser";
import type {ImportAttribute, ImportDeclaration, ImportSpecifier} from "acorn";
import type {Identifier} from "acorn";
import type {NamedImportSpecifier} from "../imports.js";
import {getImportedName, getLocalName} from "../imports.js";

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
export function renderObservableImport(
  source: string,
  node: ImportDeclaration | ImportWithDeclaration,
  inputs: string[]
): string {
  if (!inputs.includes("@variable")) inputs.push("@variable");
  return `(import(${JSON.stringify(source)}).then((_) => {
  const module = __variable._module._runtime.module(_.default)${
    "injections" in node ? `.derive([${renderObservableInjections(node)}])` : ""
  };
  const outputs = new Map(Array.from(__variable._outputs, (v) => [v._name, v]));${node.specifiers
    .filter((specifier) => specifier.type !== "ImportNamespaceSpecifier")
    .flatMap(flattenObservableImportSpecifier)
    .map((specifier) => {
      const iname = dedollar(getImportedName(specifier));
      const lname = getLocalName(specifier);
      return `
  outputs.get(${JSON.stringify(lname)})?.import(${JSON.stringify(iname)}${iname === lname ? "" : `, ${JSON.stringify(lname)}`}, module);`;
    })
    .join("")}
  return {};
}))`;
}

function renderObservableInjections(node: ImportWithDeclaration): string {
  return node.injections
    .map((node) => {
      if (node.imported.type !== "Identifier") throw new SyntaxError("unexpected import specifier");
      const imported = node.imported.name;
      const local = node.local.name;
      let injection;
      if (imported === local) {
        injection = `"${local}"`;
        if (node.view) injection += `, "viewof ${local}"`;
        if (node.mutable) injection += `, "mutable ${local}"`;
      } else {
        injection = `{name: "${imported}", alias: "${local}"}`;
        if (node.view) injection += `, {name: "viewof ${imported}", alias: "viewof ${local}"}`;
        if (node.mutable) injection += `, {name: "mutable ${imported}", alias: "mutable ${local}"}`;
      }
      return injection;
    })
    .join(", ");
}

export function toSpecialIndentifier(
  identifier: Identifier,
  type: "viewof" | "mutable"
): Identifier {
  return {...identifier, name: `${type}$${identifier.name}`};
}

export function toSpecialImportSpecifier(
  specifier: ImportSpecifier,
  type: "viewof" | "mutable"
): ImportSpecifier {
  if (specifier.imported.type !== "Identifier")
    throw new SyntaxError("unexpected import specifier");
  return {
    ...specifier,
    imported: toSpecialIndentifier(specifier.imported, type),
    local: toSpecialIndentifier(specifier.local, type)
  };
}

export function flattenObservableImportSpecifier(
  node: NamedImportSpecifier
): NamedImportSpecifier | NamedImportSpecifier[] {
  return isViewImport(node)
    ? [node, toSpecialImportSpecifier(node, "viewof")]
    : isMutableImport(node)
      ? [node, toSpecialImportSpecifier(node, "mutable")]
      : node;
}

export function isViewImport(node: NamedImportSpecifier): node is ImportSpecifier {
  return "view" in node && !!node.view;
}

export function isMutableImport(node: NamedImportSpecifier): node is ImportSpecifier {
  return "mutable" in node && !!node.mutable;
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
