import {Parser, tokTypes} from "acorn";
import type {Expression, Identifier, Options, Program} from "acorn";
import {checkAssignments} from "./assignments.js";
import {findAwaits} from "./awaits.js";
import {findDeclarations} from "./declarations.js";
import {checkExports} from "./imports.js";
import {defaultGlobals} from "./globals.js";
import {findReferences} from "./references.js";

export const acornOptions: Options = {
  ecmaVersion: "latest",
  sourceType: "module"
};

export type ParseOptions = {
  globals?: Set<string>;
};

// TODO files
export interface JavaScriptCell {
  body: Program | Expression;
  declarations: Identifier[] | null; // null for expressions that can’t declare top-level variables, a.k.a. outputs
  references: Identifier[]; // the unbound references, a.k.a. inputs
  expression: boolean; // is this an expression or a program cell?
  async: boolean; // does this use top-level await?
}

export function maybeParseJavaScript(input: string, options?: ParseOptions): JavaScriptCell | undefined {
  try {
    return parseJavaScript(input, options);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
}

export function parseJavaScript(input: string, options: ParseOptions = {}): JavaScriptCell {
  let expression = maybeParseExpression(input); // first attempt to parse as expression
  if (expression?.type === "ClassExpression" && expression.id) expression = null; // treat named class as program
  if (expression?.type === "FunctionExpression" && expression.id) expression = null; // treat named function as program
  const body = expression ?? parseProgram(input); // otherwise parse as a program
  const {globals = defaultGlobals} = options;
  const {locals, references} = findReferences(body, {filterReference: excludeNames(globals)});
  checkAssignments(body, {locals, references, globals, input});
  checkExports(body, {input});
  return {
    body,
    declarations: expression ? null : findDeclarations(body as Program, input),
    references,
    expression: !!expression,
    async: findAwaits(body).length > 0
  };
}

function excludeNames(excludes: Set<string>): (identifier: Identifier) => boolean {
  return (identifier: Identifier) => !excludes.has(identifier.name);
}

function parseProgram(input: string): Program {
  return Parser.parse(input, acornOptions);
}

function maybeParseExpression(input: string): Expression | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parser = new (Parser as any)(acornOptions, input, 0); // private constructor
  parser.nextToken();
  try {
    const node = parser.parseExpression();
    return parser.type === tokTypes.eof ? node : null;
  } catch {
    return null;
  }
}
