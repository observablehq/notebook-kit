import {tsPlugin} from "@sveltejs/acorn-typescript";
import {Parser, tokTypes} from "acorn";
import type {Expression, Identifier, Options, Program} from "acorn";
import {findAwaits} from "./awaits.js";
import {findDeclarations} from "./declarations.js";
import type {FeatureExpression} from "./features.js";
import {findFeatures} from "./features.js";
import {findReferences} from "./references.js";

const jsOptions: Options = {
  ecmaVersion: "latest",
  sourceType: "module"
};

const tsOptions: Options = {
  ...jsOptions,
  locations: true
};

export interface JavaScriptCell {
  body: Program | Expression;
  declarations: Identifier[] | null; // null for expressions that can’t declare top-level variables, a.k.a. outputs
  references: Identifier[]; // the unbound references, a.k.a. inputs
  files: FeatureExpression[]; // any calls to FileAttachment
  databases: FeatureExpression[]; // any calls to DatabaseClient
  secrets: FeatureExpression[]; // any calls to Secret
  expression: boolean; // is this an expression or a program cell?
  async: boolean; // does this use top-level await?
}

type Dialect = "js" | "ts";

const JsParser = Parser;
const TsParser = Parser.extend(tsPlugin());

function getParser(dialect: Dialect = "js"): typeof Parser {
  return dialect === "ts" ? TsParser : JsParser;
}

function getOptions(dialect: Dialect = "js"): Options {
  return dialect === "ts" ? tsOptions : jsOptions;
}

export function maybeParseJavaScript(input: string, dialect?: Dialect): JavaScriptCell | undefined {
  try {
    return parseJavaScript(input, dialect);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
}

export function parseJavaScript(input: string, dialect?: Dialect): JavaScriptCell {
  let expression = maybeParseExpression(input, dialect); // first attempt to parse as expression
  if (expression?.type === "ClassExpression" && expression.id) expression = null; // treat named class as program
  if (expression?.type === "FunctionExpression" && expression.id) expression = null; // treat named function as program
  const body = expression ?? parseProgram(input, dialect); // otherwise parse as a program
  return {
    body,
    declarations: expression ? null : findDeclarations(body as Program, input),
    references: findReferences(body, {input}),
    files: findFeatures("FileAttachment", body, input),
    databases: findFeatures("DatabaseClient", body, input),
    secrets: findFeatures("Secret", body, input),
    expression: !!expression,
    async: findAwaits(body).length > 0
  };
}

function parseProgram(input: string, dialect?: Dialect): Program {
  return getParser(dialect).parse(input, getOptions(dialect));
}

function maybeParseExpression(input: string, dialect?: Dialect): Expression | null {
  const parser = new (getParser(dialect) as any)(getOptions(dialect), input, 0); // eslint-disable-line @typescript-eslint/no-explicit-any -- private constructor
  parser.nextToken();
  try {
    const node = parser.parseExpression();
    return parser.type === tokTypes.eof ? node : null;
  } catch {
    return null;
  }
}
