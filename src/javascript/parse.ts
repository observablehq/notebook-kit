import {Parser, tokTypes} from "acorn";
import type {Expression, Identifier, Options, Program} from "acorn";
import {findReferences} from "./references.js";
import {findDeclarations} from "./declarations.js";
import {findAwaits} from "./awaits.js";

export const acornOptions: Options = {
  ecmaVersion: "latest",
  sourceType: "module"
};

// TODO files
export interface JavaScriptCell {
  body: Program | Expression;
  declarations: Identifier[] | null; // null for expressions that can’t declare top-level variables, a.k.a. outputs
  references: Identifier[]; // the unbound references, a.k.a. inputs
  expression: boolean; // is this an expression or a program cell?
  async: boolean; // does this use top-level await?
}

export function maybeParseJavaScript(input: string): JavaScriptCell | undefined {
  try {
    return parseJavaScript(input);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
}

export function parseJavaScript(input: string): JavaScriptCell {
  let expression = maybeParseExpression(input); // first attempt to parse as expression
  if (expression?.type === "ClassExpression" && expression.id) expression = null; // treat named class as program
  if (expression?.type === "FunctionExpression" && expression.id) expression = null; // treat named function as program
  const body = expression ?? parseProgram(input); // otherwise parse as a program
  return {
    body,
    declarations: expression ? null : findDeclarations(body as Program, input),
    references: findReferences(body, {input}),
    expression: !!expression,
    async: findAwaits(body).length > 0
  };
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
