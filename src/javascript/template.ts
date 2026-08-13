import type {Node, ParserImpl, TemplateLiteral} from "acorn";
import {TokContext, tokTypes as tt, Parser, Options} from "acorn";
import {getInterpreterMethod, isInterpreter} from "../lib/interpreters.js";
import type {Cell} from "../lib/notebook.js";
import {Sourcemap} from "./sourcemap.js";

const options: Options = {
  ecmaVersion: "latest",
  sourceType: "module"
};

const CODE_DOLLAR = 36;
const CODE_BACKSLASH = 92;
const CODE_BACKTICK = 96;
const CODE_BRACEL = 123;

// Based on acorn’s q_tmpl. We will use this to initialize the parser context so our
// `readTemplateToken` override is called. `readTemplateToken` is based on acorn's `readTmplToken`
// which is used inside template literals. Our version allows backQuotes.
const o_tmpl = new TokContext(
  "`", // token
  true, // isExpr
  true, // preserveSpace
  (parser) => (parser as TemplateCellParser).readTemplateToken() // override
);

// Adapted from https://github.com/observablehq/parser/blob/b6ec1db139913493b39c9d0ccb02a1636570a64e/src/parse.js#L233
class TemplateCellParser extends (Parser as typeof ParserImpl) {
  constructor(options: Options, input: string, startPos?: number) {
    super(options, input, startPos);
    this.type = tt.backQuote; // initially inside a backQuote
    this.exprAllowed = false;
  }
  initialContext() {
    return [o_tmpl];
  }
  parseTopLevel(node: Node): Node {
    if (this.type === tt.eof) this.value = ""; // fix for nextToken calling finishToken(tt.eof)
    const isTagged = true;
    const template = node as TemplateLiteral;
    template.expressions = [];
    let curElt = this.parseTemplateElement({isTagged});
    template.quasis = [curElt];
    while (this.type !== tt.eof) {
      this.expect(tt.dollarBraceL);
      template.expressions.push(this.parseExpression());
      this.expect(tt.braceR);
      template.quasis.push((curElt = this.parseTemplateElement({isTagged})));
    }
    curElt.tail = true;
    this.next();
    this.finishNode(template, "TemplateLiteral");
    this.expect(tt.eof);
    return template;
  }
  readTemplateToken() {
    out: for (; this.pos < this.input.length; this.pos++) {
      switch (this.input.charCodeAt(this.pos)) {
        case CODE_BACKSLASH: {
          if (this.pos < this.input.length - 1) ++this.pos; // not a terminal slash
          break;
        }
        case CODE_DOLLAR: {
          if (this.input.charCodeAt(this.pos + 1) === CODE_BRACEL) {
            if (this.pos === this.start && this.type === tt.invalidTemplate) {
              this.pos += 2;
              return this.finishToken(tt.dollarBraceL);
            }
            break out;
          }
          break;
        }
      }
    }
    return this.finishToken(tt.invalidTemplate, this.input.slice(this.start, this.pos));
  }
}

export function parseTemplate(input: string): TemplateLiteral {
  return TemplateCellParser.parse(input, options) as Node as TemplateLiteral;
}

/** @deprecated */
export function transpileTemplate(input: string, tag?: string, raw?: boolean): string;
export function transpileTemplate(cell: Cell): string;
export function transpileTemplate(input: string | Cell, tag = "", raw = false): string {
  let cell: Cell | undefined;
  let prefix: string;
  let suffix: string;
  if (typeof input !== "string") {
    cell = input;
    input = cell.value;
    prefix = getPrefix(cell);
    suffix = getSuffix(cell);
    raw = getRaw(cell);
  } else {
    prefix = tag;
    suffix = "";
  }
  if (!input) return input;
  const source = new Sourcemap(input);
  let node: Node;
  if (cell && isInterpreter(cell.mode)) {
    node = {type: "Literal", start: 0, end: input.length};
    escapeBacktick(source, node);
    escapeBackslash(source, node);
    escapeDollarCurly(source, node);
  } else {
    const template = parseTemplate(input);
    (raw ? escapeRawTemplateElements : escapeTemplateElements)(source, template);
    node = template;
  }
  source.insertLeft(node.start, `${prefix}\``);
  source.insertRight(node.end, `\`${suffix}`);
  return String(source);
}

function getRaw(cell: Cell): boolean {
  return cell.mode !== "md";
}

function getPrefix(cell: Cell): string {
  return cell.mode === "tex"
    ? "tex.block"
    : cell.mode === "sql"
      ? getSqlPrefix(cell)
      : isInterpreter(cell.mode)
        ? getInterpreterPrefix(cell)
        : cell.mode === "html"
          ? "htl.html"
          : cell.mode;
}

function getDatabase(cell: Cell): string {
  const {id, database = "var:db", since} = cell;
  return database.startsWith("var:")
    ? database.slice("var:".length)
    : `DatabaseClient(${JSON.stringify(database)}, {id: ${id}${since === undefined ? "" : `, since: ${JSON.stringify(since)}`}})`;
}

function getSqlPrefix(cell: Cell): string {
  return `${getDatabase(cell)}.sql`;
}

function getSqlSuffix(cell: Cell): string {
  return cell.hidden ? "" : ".then(Inputs.table)";
}

function getSqlViewSuffix(cell: Cell): string {
  return `.bind(${getDatabase(cell)})`;
}

function getInterpreterPrefix(cell: Cell): string {
  const {id, mode, format, since} = cell;
  return `Interpreter(${JSON.stringify(mode)}, {id: ${id}${format === undefined ? "" : `, format: ${JSON.stringify(format)}`}${since === undefined ? "" : `, since: ${JSON.stringify(since)}`}}).run(`;
}

function getSuffix(cell: Cell): string {
  return cell.mode === "sql"
    ? getSqlSuffix(cell)
    : cell.mode === "sql.view"
      ? getSqlViewSuffix(cell)
      : isInterpreter(cell.mode)
        ? getInterpreterSuffix(cell)
        : "";
}

function getInterpreterSuffix(cell: Cell): string {
  const method = getInterpreterMethod(cell.format);
  return method ? `).then((file) => file${method})` : ")";
}

function escapeTemplateElements(source: Sourcemap, node: TemplateLiteral): void {
  for (const quasi of node.quasis) {
    escapeBacktick(source, quasi);
    escapeLiteralBackslash(source, quasi);
  }
}

function escapeRawTemplateElements(source: Sourcemap, node: TemplateLiteral): void {
  for (const quasi of node.quasis) {
    escapeBacktick(source, quasi);
  }
  interpolateTerminalBackslash(source);
}

/** Escapes any backtick. */
function escapeBacktick(source: Sourcemap, {start, end}: Node): void {
  const {input} = source;
  for (let i = start; i < end; ++i) {
    if (input.charCodeAt(i) === CODE_BACKTICK) {
      source.insertRight(i, "\\");
    }
  }
}

/** Escapes any backslash. */
function escapeBackslash(source: Sourcemap, {start, end}: Node): void {
  const {input} = source;
  for (let i = start; i < end; ++i) {
    if (input.charCodeAt(i) === CODE_BACKSLASH) {
      source.insertRight(i, "\\");
    }
  }
}

/** Escapes a backslash, unless it is used to escape a dollar-curly such as "$\{" or "\${". */
function escapeLiteralBackslash(source: Sourcemap, {start, end}: Node): void {
  const {input} = source;
  let afterDollar = false;
  let oddBackslashes = false;
  for (let i = start; i < end; ++i) {
    switch (input.charCodeAt(i)) {
      case CODE_DOLLAR: {
        afterDollar = true;
        oddBackslashes = false;
        break;
      }
      case CODE_BACKSLASH: {
        oddBackslashes = !oddBackslashes;
        if (afterDollar && input.charCodeAt(i + 1) === CODE_BRACEL) continue;
        if (oddBackslashes && input.charCodeAt(i + 1) === CODE_DOLLAR && input.charCodeAt(i + 2) === CODE_BRACEL) continue; // prettier-ignore
        source.insertRight(i, "\\");
        break;
      }
      default: {
        afterDollar = false;
        oddBackslashes = false;
        break;
      }
    }
  }
}

function interpolateTerminalBackslash(source: Sourcemap): void {
  const {input} = source;
  let oddBackslashes = false;
  for (let i = input.length - 1; i >= 0; i--) {
    if (input.charCodeAt(i) !== CODE_BACKSLASH) break;
    oddBackslashes = !oddBackslashes;
  }
  if (oddBackslashes) source.replaceRight(input.length - 1, input.length, "${'\\\\'}");
}

/** Escapes a dollar curly, from "${…}" to "$\{…}". */
function escapeDollarCurly(source: Sourcemap, {start, end}: Node): void {
  const {input} = source;
  for (let i = start; i < end; ++i) {
    if (input.charCodeAt(i) !== CODE_BRACEL || input.charCodeAt(i - 1) !== CODE_DOLLAR) continue;
    source.insertRight(i, "\\");
  }
}
