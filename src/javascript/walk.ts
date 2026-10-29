import type {Expression, Identifier, Node, Pattern} from "acorn";
import type {AncestorVisitors, RecursiveVisitors, SimpleVisitors} from "acorn-walk";
import {make} from "acorn-walk";
import {ancestor as baseAncestor} from "acorn-walk";
import {recursive as baseRecursive} from "acorn-walk";
import {simple as baseSimple} from "acorn-walk";

type Callback = (node: Node, state: unknown, type?: string) => void;

function callbackId(node: {id: Identifier}, state: unknown, c: Callback): void {
  c(node.id, state, "Identifier");
}

function callbackExpression(node: {expression: Expression}, state: unknown, c: Callback): void {
  c(node.expression, state, "Expression");
}

function callbackParameter(node: {parameter: Pattern}, state: unknown, c: Callback): void {
  c(node.parameter, state, "Pattern");
}

function callbackArgument(node: {argument: Expression}, state: unknown, c: Callback): void {
  c(node.argument, state, "Expression");
}

function callbackChildren(node: {children: Node[]}, state: unknown, c: Callback): void {
  for (const child of node.children) c(child, state);
}

// Visits the opening tag (name and attributes) and children; the closing tag
// would only revisit the name.
function callbackElement(node: {openingElement: Node; children: Node[]}, state: unknown, c: Callback): void {
  c(node.openingElement, state);
  callbackChildren(node, state, c);
}

function callbackOpeningElement(node: {name: Node; attributes: Node[]}, state: unknown, c: Callback): void {
  c(node.name, state);
  for (const attribute of node.attributes) c(attribute, state);
}

// Like non-computed properties, attribute names are not visited.
function callbackAttribute(node: {value: Node | null}, state: unknown, c: Callback): void {
  if (node.value) c(node.value, state);
}

// Like non-computed member expressions, only the object is visited.
function callbackObject(node: {object: Node}, state: unknown, c: Callback): void {
  c(node.object, state);
}

function skip() {}

const visitors = {
  ViewExpression: callbackId,
  MutableExpression: callbackId,
  TSTypeAliasDeclaration: skip,
  TSInterfaceDeclaration: skip,
  TSDeclareFunction: skip,
  TSDeclareMethod: skip,
  TSIndexSignature: skip,
  TSNamespaceExportDeclaration: skip,
  TSEnumDeclaration: skip,
  TSModuleDeclaration: skip,
  TSImportEqualsDeclaration: skip,
  TSExportAssignment: skip,
  TSAsExpression: callbackExpression,
  TSSatisfiesExpression: callbackExpression,
  TSNonNullExpression: callbackExpression,
  TSTypeAssertion: callbackExpression,
  TSInstantiationExpression: callbackExpression,
  TSTypeCastExpression: callbackExpression,
  TSParameterProperty: callbackParameter,
  JSXElement: callbackElement,
  JSXFragment: callbackChildren,
  JSXOpeningElement: callbackOpeningElement,
  JSXAttribute: callbackAttribute,
  JSXSpreadAttribute: callbackArgument,
  JSXExpressionContainer: callbackExpression,
  JSXSpreadChild: callbackExpression,
  JSXMemberExpression: callbackObject,
  JSXIdentifier: skip,
  JSXNamespacedName: skip,
  JSXEmptyExpression: skip,
  JSXText: skip
};

const walk = make(visitors as RecursiveVisitors<unknown>);

export function ancestor<T>(node: Node, visitors: AncestorVisitors<T>, state?: T): void {
  return baseAncestor(node, visitors, walk as RecursiveVisitors<T>, state);
}

export function recursive<T>(node: Node, state: T, functions: RecursiveVisitors<T>): void {
  return baseRecursive(node, state, functions, walk as RecursiveVisitors<T>);
}

export function simple<T>(node: Node, visitors: SimpleVisitors<T>, state?: T): void {
  return baseSimple(node, visitors, walk as RecursiveVisitors<T>, state);
}
