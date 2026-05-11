import ExcelJS from "exceljs";
import {assert, describe, expect, test, vi} from "vitest";
import {Workbook} from "./xlsx.js";

// Route exceljs to the version from devDependencies
vi.mock("https://cdn.jsdelivr.net/npm/exceljs/+esm", async () => import("exceljs"));

declare module "vitest" {
  interface Matchers {
    toBeSheet: (sheet: Record<string, ExcelJS.CellValue>[] & {columns: string[]}) => unknown;
  }
}

// Sheets are decorated with a `.columns` property
expect.extend({
  toBeSheet(a, b) {
    return {
      pass: this.equals(a, b) && this.equals(Reflect.get(a, "columns"), Reflect.get(b, "columns")),
      message: () => `expected sheet to${this.isNot ? " not" : ""} be`,
      actual: a,
      expected: b
    };
  }
});

function createWorkbook(sheets: Record<string, ExcelJS.CellValue[][]>) {
  const workbook = new ExcelJS.Workbook();
  for (const [sheet, rows] of Object.entries(sheets)) {
    const ws = workbook.addWorksheet(sheet);
    for (const row of rows) ws.addRow(row);
  }
  return new Workbook(workbook);
}

describe("FileAttachment.xlsx", () => {
  test("reads sheet names", () => {
    const workbook = createWorkbook({Sheet1: []});
    assert.deepStrictEqual(workbook.sheetNames, ["Sheet1"]);
  });

  test("sheet(name) throws on unknown sheet name", () => {
    const workbook = createWorkbook({Sheet1: []});
    assert.throws(() => workbook.sheet("bad"));
  });

  test("reads sheets", () => {
    const workbook = createWorkbook({
      Sheet1: [
        ["one", "two", "three"],
        [1, 2, 3]
      ]
    });
    expect(workbook.sheet(0)).toBeSheet(
      Object.assign(
        [
          {A: "one", B: "two", C: "three"},
          {A: 1, B: 2, C: 3}
        ],
        {columns: [..."#ABC"]}
      )
    );
    expect(workbook.sheet("Sheet1")).toBeSheet(
      Object.assign(
        [
          {A: "one", B: "two", C: "three"},
          {A: 1, B: 2, C: 3}
        ],
        {columns: [..."#ABC"]}
      )
    );
    assert.strictEqual(workbook.sheet(0)[0]["#"], 1);
    assert.strictEqual(workbook.sheet(0)[1]["#"], 2);
  });

  test("reads sheets with primitive types", () => {
    const workbook = createWorkbook({
      Sheet1: [
        [],
        [null, undefined],
        ["hello", "", "0", "1"],
        [1, 1.2],
        [true, false],
        [new Date(Date.UTC(2020, 0, 1)), {} as unknown as ExcelJS.CellValue]
      ]
    });
    expect(workbook.sheet(0)).toBeSheet(
      Object.assign(
        [
          {},
          {},
          {A: "hello", B: "", C: "0", D: "1"},
          {A: 1, B: 1.2},
          {A: true, B: false},
          {A: new Date(Date.UTC(2020, 0, 1))} // unknown shapes drop
        ],
        {columns: [..."#ABCD"]}
      )
    );
  });

  test("reads rich text and hyperlinks", () => {
    const workbook = createWorkbook({
      Sheet1: [
        [
          {richText: [{text: "two"}, {text: "three"}]}, // A
          {text: `link&</a>"'?`, hyperlink: 'https://example.com?q="'}, // B
          {text: "https://example.com", hyperlink: "https://example.com"} // C, text===hyperlink
        ]
      ]
    });
    expect(workbook.sheet(0)).toBeSheet(
      Object.assign(
        [
          {
            A: "twothree",
            B: `https://example.com?q=" link&</a>"'?`,
            C: "https://example.com"
          }
        ],
        {columns: [..."#ABC"]}
      )
    );
  });

  test("fails on malformed hyperlinks", () => {
    const workbook = createWorkbook({
      Sheet1: [
        [
          {text: "plain text"} as unknown as ExcelJS.CellValue, // A (drop)
          {
            text: {richText: [{text: "https://example.com"}]},
            hyperlink: "https://example.com"
          } as unknown as ExcelJS.CellValue // B
        ]
      ]
    });
    expect(workbook.sheet(0)).toBeSheet(
      Object.assign([{B: "https://example.com [object Object]"}], {columns: [..."#AB"]})
    );
  });

  test("reads formulas", () => {
    const workbook = createWorkbook({
      Sheet1: [
        [
          {formula: "=B2*5", result: 10},
          {sharedFormula: "=B2*6", result: 12},
          {sharedFormula: "=Z2*6", result: {error: "#REF!"}}
        ]
      ]
    });
    expect(workbook.sheet(0)).toBeSheet(
      Object.assign([{A: 10, B: 12, C: NaN}], {
        columns: [..."#ABC"]
      })
    );
  });

  test("reads sheets with headers", () => {
    const workbook = createWorkbook({
      Sheet1: [
        [null, "one", "one", "two", "A", "0"],
        [1, null, 3, 4, 5, "zero"],
        [6, 7, 8, 9, 10]
      ]
    });
    expect(workbook.sheet(0, {headers: true})).toBeSheet(
      Object.assign(
        [
          {A: 1, one_: 3, two: 4, A_: 5, 0: "zero"},
          {A: 6, one: 7, one_: 8, two: 9, A_: 10}
        ],
        {columns: ["#", "A", "one", "one_", "two", "A_", "0"]}
      )
    );
  });

  test("throws on invalid ranges", () => {
    const workbook = createWorkbook({Sheet1: []});
    const malformed = /Malformed range specifier/;
    assert.throws(() => workbook.sheet(0, {range: 0 as unknown as string}), malformed);
    assert.throws(() => workbook.sheet(0, {range: ""}), malformed);
    assert.throws(() => workbook.sheet(0, {range: "-:"}), malformed);
    assert.throws(() => workbook.sheet(0, {range: " :"}), malformed);
    assert.throws(() => workbook.sheet(0, {range: "a1:"}), malformed); // lowercase
    assert.throws(() => workbook.sheet(0, {range: "1A:"}), malformed);
  });

  test("reads sheet ranges", () => {
    const workbook = createWorkbook({
      Sheet1: [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
        [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
        [30, 31, 32, 33, 34, 35, 36, 37, 38, 39]
      ]
    });

    // undefined / ":"
    const entireSheet = Object.assign(
      [
        {A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9},
        {A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 18, J: 19},
        {A: 20, B: 21, C: 22, D: 23, E: 24, F: 25, G: 26, H: 27, I: 28, J: 29},
        {A: 30, B: 31, C: 32, D: 33, E: 34, F: 35, G: 36, H: 37, I: 38, J: 39}
      ],
      {columns: [..."#ABCDEFGHIJ"]}
    );
    expect(workbook.sheet(0)).toBeSheet(entireSheet);
    expect(workbook.sheet(0, {range: ":"})).toBeSheet(entireSheet);

    // "B2:C3"
    expect(workbook.sheet(0, {range: "B2:C3"})).toBeSheet(
      Object.assign(
        [
          {B: 11, C: 12},
          {B: 21, C: 22}
        ],
        {columns: [..."#BC"]}
      )
    );

    // ":C3"
    expect(workbook.sheet(0, {range: ":C3"})).toBeSheet(
      Object.assign(
        [
          {A: 0, B: 1, C: 2},
          {A: 10, B: 11, C: 12},
          {A: 20, B: 21, C: 22}
        ],
        {columns: [..."#ABC"]}
      )
    );

    // "B2:"
    expect(workbook.sheet(0, {range: "B2:"})).toBeSheet(
      Object.assign(
        [
          {B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 18, J: 19},
          {B: 21, C: 22, D: 23, E: 24, F: 25, G: 26, H: 27, I: 28, J: 29},
          {B: 31, C: 32, D: 33, E: 34, F: 35, G: 36, H: 37, I: 38, J: 39}
        ],
        {columns: [..."#BCDEFGHIJ"]}
      )
    );

    // "H:"
    expect(workbook.sheet(0, {range: "H:"})).toBeSheet(
      Object.assign(
        [
          {H: 7, I: 8, J: 9},
          {H: 17, I: 18, J: 19},
          {H: 27, I: 28, J: 29},
          {H: 37, I: 38, J: 39}
        ],
        {columns: ["#", "H", "I", "J"]}
      )
    );

    // ":C"
    expect(workbook.sheet(0, {range: ":C"})).toBeSheet(
      Object.assign(
        [
          {A: 0, B: 1, C: 2},
          {A: 10, B: 11, C: 12},
          {A: 20, B: 21, C: 22},
          {A: 30, B: 31, C: 32}
        ],
        {columns: ["#", "A", "B", "C"]}
      )
    );

    // ":Z"
    expect(workbook.sheet(0, {range: ":Z"})).toBeSheet(
      Object.assign(entireSheet.slice(), {
        columns: [..."#ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
      })
    );

    // "2:"
    expect(workbook.sheet(0, {range: "2:"})).toBeSheet(
      Object.assign(entireSheet.slice(1), {columns: entireSheet.columns})
    );

    // ":2"
    expect(workbook.sheet(0, {range: ":2"})).toBeSheet(
      Object.assign(entireSheet.slice(0, 2), {columns: entireSheet.columns})
    );
  });

  test("derives column names such as A AA AAA…", () => {
    const l0 = 26 * 26 * 23;
    const workbook = createWorkbook({Sheet1: [Array.from<number>({length: l0}).fill(1)]});
    assert.deepStrictEqual(
      workbook.sheet(0).columns.filter((d: string) => d.match(/^A+$/)),
      ["A", "AA", "AAA"]
    );
  });

  test("headers protects __proto__ of row objects", () => {
    const workbook = createWorkbook({
      Sheet1: [["__proto__"], [{a: 1} as unknown as ExcelJS.CellValue]]
    });
    assert.notStrictEqual(workbook.sheet(0, {headers: true})[0].a, 1);
  });
});
