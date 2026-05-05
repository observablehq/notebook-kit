import {Token, tokenizer as Tokenizer, tokTypes} from "acorn";
import type {SourceFile} from "typescript";
import {ModuleKind, ScriptTarget, transpile} from "typescript";
import {createProgram, createSourceFile} from "typescript";
import {isClassExpression, isFunctionExpression, isParenthesizedExpression} from "typescript";
import {isExpressionStatement} from "typescript";

const tokenizerOptions = {
  ecmaVersion: "latest"
} as const;

const compilerOptions = {
  target: ScriptTarget.ESNext,
  module: ModuleKind.Preserve,
  verbatimModuleSyntax: true,
  alwaysStrict: false
} as const;

export function transpileTypeScript(input: string): string {
  const expr = maybeExpression(input);
  if (expr) return trimTrailingSemicolon(transpile(expr, compilerOptions));
  parseTypeScript(input); // enforce valid syntax
  return transpile(input, compilerOptions);
}

/** If the given is an expression (not a statement), returns it with parens. */
function maybeExpression(input: string): string | undefined {
  if (!hasMatchedParens(input)) return; // disallow funny business
  const expr = withParens(input);
  if (!isSolitaryExpression(expr)) return;
  return expr;
}

/** Parses the specified TypeScript input, returning the AST or throwing a SyntaxError. */
function parseTypeScript(input: string): SourceFile {
  const file = createSourceFile("input.ts", input, compilerOptions.target);
  const program = createProgram(["input.ts"], compilerOptions, {
    getSourceFile: (path) => (path === "input.ts" ? file : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getDirectories: () => [],
    getCanonicalFileName: (path) => path,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (path) => path === "input.ts",
    readFile: (path) => (path === "input.ts" ? input : undefined)
  });
  const diagnostics = program.getSyntacticDiagnostics(file);
  if (diagnostics.length > 0) {
    const [diagnostic] = diagnostics;
    throw new SyntaxError(String(diagnostic.messageText));
  }
  return file;
}

/** Returns true if the specified input is exactly one parenthesized expression statement. */
function isSolitaryExpression(input: string): boolean {
  let file;
  try {
    file = parseTypeScript(input);
  } catch {
    return false;
  }
  if (file.statements.length !== 1) return false;
  const statement = file.statements[0];
  if (!isExpressionStatement(statement)) return false;
  const expression = statement.expression;
  if (!isParenthesizedExpression(expression)) return false;
  const subexpression = expression.expression;
  if (isClassExpression(subexpression) && subexpression.name) return false;
  if (isFunctionExpression(subexpression) && subexpression.name) return false;
  return true;
}

function* tokenize(input: string): Generator<Token> {
  const tokenizer = Tokenizer(input, tokenizerOptions);
  while (true) {
    const t = tokenizer.getToken();
    if (t.type === tokTypes.eof) break;
    yield t;
  }
}

/** Returns true if the specified input has matched parens. */
function hasMatchedParens(input: string): boolean {
  let depth = 0;
  for (const t of tokenize(input)) {
    if (t.type === tokTypes.parenL) ++depth;
    else if (t.type === tokTypes.parenR && --depth < 0) return false;
  }
  return depth === 0;
}

/** Wraps the specified input with parentheses. */
function withParens(input: string): string {
  let start;
  let end;
  for (const t of tokenize(input)) {
    start ??= t;
    end = t;
  }
  return `(${input.slice(start?.start, end?.end)})`;
}

/** Removes a trailing semicolon, if present. */
function trimTrailingSemicolon(input: string): string {
  let end;
  for (const t of tokenize(input)) end = t;
  return end?.type === tokTypes.semi ? input.slice(0, end.start) : input;
}
