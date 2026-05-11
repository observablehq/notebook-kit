import Excel from "https://cdn.jsdelivr.net/npm/exceljs/+esm";

export class Workbook {
  declare private readonly _: Excel.Workbook;
  declare readonly sheetNames: string[];

  constructor(workbook: Excel.Workbook) {
    Object.defineProperties(this, {
      _: {value: workbook},
      sheetNames: {value: workbook.worksheets.map((s) => s.name), enumerable: true}
    });
  }

  static async load(buffer: ArrayBuffer): Promise<Workbook> {
    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(buffer);
    return new Workbook(workbook);
  }

  sheet(name: string | number, options?: ExtractOptions) {
    const sname =
      typeof name === "number"
        ? this.sheetNames[name]
        : this.sheetNames.includes((name = `${name}`))
          ? name
          : null;
    if (sname == null) throw new Error(`Sheet not found: ${name}`);
    const sheet = this._.getWorksheet(sname);
    if (!sheet) throw new Error(`Sheet not found: ${name}`);
    return extract(sheet, options);
  }
}

export interface ExtractOptions {
  range?: string;
  headers?: boolean;
}

function extract(sheet: Excel.Worksheet, {range, headers}: ExtractOptions = {}) {
  let [[c0, r0], [c1, r1]] = parseRange(range, sheet); // eslint-disable-line prefer-const
  const headerRow = headers ? sheet.getRow(++r0) : null;
  const nameset = new Set(["#"]);
  for (let n = c0; n <= c1; n++) {
    const value = headerRow ? valueOf(headerRow.findCell(n + 1)) : null;
    let name = (value && value + "") || toColumn(n);
    while (nameset.has(name)) name += "_";
    nameset.add(name);
  }
  const names = new Array(c0).concat(Array.from(nameset));
  const columns = names.filter(() => true); // Filter sparse columns
  const output = Object.assign(new Array(r1 - r0 + 1), {columns});
  for (let r = r0; r <= r1; r++) {
    const row = (output[r - r0] = Object.create(null, {"#": {value: r + 1}}));
    const _row = sheet.getRow(r + 1);
    if (_row.hasValues)
      for (let c = c0; c <= c1; c++) {
        const value = valueOf(_row.findCell(c + 1));
        if (value != null) row[names[c + 1]] = value;
      }
  }
  return output;
}

type PrimitiveValue = string | number | boolean | Date | null | undefined;
type NonPrimitiveValue = Exclude<Excel.CellValue, PrimitiveValue>;
type FormulaValue = Excel.CellFormulaValue | Excel.CellSharedFormulaValue;

function isPrimitive(value: Excel.CellValue): value is PrimitiveValue {
  return !value || typeof value !== "object" || value instanceof Date;
}

function isFormula(value: NonPrimitiveValue): value is FormulaValue {
  return "formula" in value || "sharedFormula" in value;
}

function isRichText(value: NonPrimitiveValue): value is Excel.CellRichTextValue {
  return "richText" in value;
}

function isHyperlink(value: NonPrimitiveValue): value is Excel.CellHyperlinkValue {
  return "hyperlink" in value;
}

function valueOf(cell: Excel.Cell | undefined) {
  if (!cell) return;
  const {value} = cell;
  if (isPrimitive(value)) return value;
  if (isFormula(value)) return isPrimitive(value.result) ? value.result : NaN; // result is error
  if (isRichText(value)) return richText(value);
  if (isHyperlink(value)) return hyperlink(value);
  return undefined; // value is error
}

function richText(value: Excel.CellRichTextValue) {
  return value.richText.map((d) => d.text).join("");
}

function hyperlink({hyperlink, text}: Excel.CellHyperlinkValue) {
  return hyperlink && hyperlink !== text ? `${hyperlink} ${text}` : text;
}

type Range = [[c0: number, r0: number], [c1: number, r1: number]];

function parseRange(specifier = ":", {columnCount, rowCount}: Excel.Worksheet): Range {
  specifier = `${specifier}`;
  if (!specifier.match(/^[A-Z]*\d*:[A-Z]*\d*$/)) throw new Error("Malformed range specifier");
  const [[c0 = 0, r0 = 0], [c1 = columnCount - 1, r1 = rowCount - 1]] = specifier
    .split(":")
    .map(fromCellReference);
  return [
    [c0, r0],
    [c1, r1]
  ];
}

// Returns the default column name for a zero-based column index.
// For example: 0 -> "A", 1 -> "B", 25 -> "Z", 26 -> "AA", 27 -> "AB".
function toColumn(c: number): string {
  let sc = "";
  c++;
  do sc = String.fromCharCode(64 + (c % 26 || 26)) + sc;
  while ((c = Math.floor((c - 1) / 26)));
  return sc;
}

// Returns the zero-based indexes from a cell reference.
// For example: "A1" -> [0, 0], "B2" -> [1, 1], "AA10" -> [26, 9].
function fromCellReference(specifier: string): [c?: number, r?: number] {
  const [, sc, sr] = specifier.match(/^([A-Z]*)(\d*)$/)!;
  let c = 0;
  if (sc) {
    for (let i = 0; i < sc.length; i++) {
      c += Math.pow(26, sc.length - i - 1) * (sc.charCodeAt(i) - 64);
    }
  }
  return [c ? c - 1 : undefined, sr ? +sr - 1 : undefined];
}
