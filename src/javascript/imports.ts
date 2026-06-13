import type {CallExpression, ImportDeclaration, MemberExpression, Node} from "acorn";
import type {ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier} from "acorn";
import {resolveJsrImport} from "./imports/jsr.js";
import {resolveNpmImport} from "./imports/npm.js";
import {isMutableImport, isViewImport} from "./imports/observable.js";
import {resolveObservableImport, toSpecialImportSpecifier} from "./imports/observable.js";
import {isObservableImport, renderObservableImport} from "./imports/observable.js";
import type {Sourcemap} from "./sourcemap.js";
import type {StringLiteral} from "./strings.js";
import {getStringLiteralValue, isStringLiteral} from "./strings.js";
import {syntaxError} from "./syntaxError.js";
import {simple} from "./walk.js";

export type NamedImportSpecifier =
  | ImportSpecifier // import {foo}
  | ImportDefaultSpecifier; // import foo

export type AnyImportSpecifier =
  | ImportSpecifier // import {foo}
  | ImportDefaultSpecifier // import foo
  | ImportNamespaceSpecifier; // import * as foo

/** Throws a syntax error if any export declarations are found. */
export function checkExports(body: Node, {input}: {input: string}): void {
  function checkExport(child: Node) {
    throw syntaxError("Unexpected token 'export'", child, input);
  }
  simple(body, {
    ExportAllDeclaration: checkExport,
    ExportNamedDeclaration: checkExport
  });
}

/** Returns true if the body includes an import declaration. */
export function hasImportDeclaration(body: Node): boolean {
  let has = false;

  simple(body, {
    ImportDeclaration() {
      has = true;
    }
  });

  return has;
}

/** Returns true if the given node is an import.meta.resolve(…) call. */
export function isImportMetaResolve(node: CallExpression): boolean {
  return (
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "MetaProperty" &&
    node.callee.object.meta.name === "import" &&
    node.callee.object.property.name === "meta" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "resolve" &&
    node.arguments.length > 0
  );
}

/** Returns true if the given node is an import.meta.url expression. */
export function isImportMetaUrl(node: MemberExpression): boolean {
  return (
    node.object.type === "MetaProperty" &&
    node.object.meta.name === "import" &&
    node.object.property.name === "meta" &&
    node.property.type === "Identifier" &&
    node.property.name === "url"
  );
}

function resolveImport(specifier: string): string {
  return resolveObservableImport(resolveJsrImport(resolveNpmImport(specifier)));
}

export type RewriteImportOptions = {
  /** If true, resolve local imports relative to document.baseURI. */
  resolveLocalImports?: boolean;
};

export function rewriteImportExpressions(
  output: Sourcemap,
  body: Node,
  {resolveLocalImports}: RewriteImportOptions = {}
): void {
  function rewriteImportSource(source: StringLiteral, node: Node = source) {
    const value = getStringLiteralValue(source);
    const resolution = resolveImport(value);
    output.replaceLeft(
      node.start,
      node.end,
      resolveLocalImports && isLocalImport(resolution)
        ? `new URL(${JSON.stringify(resolution)}, document.baseURI).href`
        : JSON.stringify(resolution)
    );
  }
  simple(body, {
    ImportExpression(node) {
      const source = node.source;
      if (isStringLiteral(source)) {
        rewriteImportSource(source);
      }
    },
    MemberExpression(node) {
      if (resolveLocalImports && isImportMetaUrl(node)) {
        output.replaceLeft(node.start, node.end, "document.baseURI");
      }
    },
    CallExpression(node) {
      const source = node.arguments[0];
      if (isImportMetaResolve(node) && isStringLiteral(source)) {
        rewriteImportSource(source, node);
      }
    }
  });
}

/** Note: mutates inputs! */
export function rewriteImportDeclarations(
  output: Sourcemap,
  body: Node,
  inputs: string[],
  {resolveLocalImports}: RewriteImportOptions = {}
): void {
  const declarations: [ImportDeclaration, StringLiteral][] = [];

  simple(body, {
    ImportDeclaration(node) {
      if (isStringLiteral(node.source)) {
        declarations.push([node, node.source]);
      }
    }
  });

  const specifiers: string[] = [];
  const imports: string[] = [];
  for (const [node, source] of declarations) {
    output.delete(node.start, node.end + +(output.input[node.end] === "\n"));
    specifiers.push(rewriteImportSpecifiers(node));
    const value = getStringLiteralValue(source);
    const resolution = resolveImport(value);
    imports.push(
      isObservableImport(node, value)
        ? renderObservableImport(resolution, node, inputs)
        : renderImport(
            resolveLocalImports && isLocalImport(resolution)
              ? `new URL(${JSON.stringify(resolution)}, document.baseURI)`
              : JSON.stringify(resolution),
            node,
            output.input
          )
    );
  }
  if (declarations.length > 1) {
    output.insertLeft(0, `const [${specifiers.join(", ")}] = await Promise.all([${imports.join(", ")}]);\n`); // prettier-ignore
  } else if (declarations.length === 1) {
    output.insertLeft(0, `const ${specifiers[0]} = await ${imports[0]};\n`);
  }
}

function renderImport(source: string, node: ImportDeclaration, input: string): string {
  const names = node.specifiers.filter(isNamedSpecifier).map(getImportedName);
  return `import(${source}${
    node.attributes.length > 0
      ? `, {with: {${input.slice(
          node.attributes[0].start,
          node.attributes[node.attributes.length - 1].end
        )}}}`
      : ""
  })${
    names.length > 0
      ? `.then((module) => {${names
          .map(
            (name) => `
  if (!("${name}" in module)) throw new SyntaxError(\`export '${name}' not found\`);`
          )
          .join("")}
  return module;
})`
      : ""
  }`;
}

export function getLocalName(node: NamedImportSpecifier): string {
  return node.local.name;
}

export function getImportedName(node: NamedImportSpecifier): string {
  return node.type === "ImportDefaultSpecifier"
    ? "default"
    : node.imported.type === "Identifier"
      ? node.imported.name
      : node.imported.raw!;
}

function isLocalImport(source: string): boolean {
  return ["./", "../", "/"].some((prefix) => source.startsWith(prefix));
}

function isNamespaceSpecifier(node: AnyImportSpecifier): node is ImportNamespaceSpecifier {
  return node.type === "ImportNamespaceSpecifier";
}

function isNamedSpecifier(node: AnyImportSpecifier): node is NamedImportSpecifier {
  return node.type !== "ImportNamespaceSpecifier";
}

function rewriteImportSpecifiers(node: ImportDeclaration): string {
  return node.specifiers.some(isNamedSpecifier)
    ? `{${flatMapImportSpecifiers(node, rewriteImportSpecifier).join(", ")}}`
    : (node.specifiers.find(isNamespaceSpecifier)?.local.name ?? "{}");
}

export function flatMapImportSpecifiers<T>(
  node: ImportDeclaration,
  f: (node: NamedImportSpecifier) => T
): T[] {
  return node.specifiers.flatMap((node) => {
    if (node.type === "ImportNamespaceSpecifier")
      throw new SyntaxError("unexpected namespace specifier");
    return isViewImport(node)
      ? [f(node), f(toSpecialImportSpecifier(node, "viewof"))]
      : isMutableImport(node)
        ? [f(node), f(toSpecialImportSpecifier(node, "mutable"))]
        : f(node);
  });
}

function rewriteImportSpecifier(node: NamedImportSpecifier): string {
  return getImportedName(node) === getLocalName(node)
    ? getLocalName(node)
    : `${getImportedName(node)}: ${getLocalName(node)}`;
}
