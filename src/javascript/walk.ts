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
  TSParameterProperty: callbackParameter
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
