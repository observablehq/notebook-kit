import ExcelJS from "exceljs";
import {describe, expect, test, vi} from "vitest";
import {Workbook} from "./xlsx.js";

// Route exceljs to the version from devDependencies
vi.mock("https://cdn.jsdelivr.net/npm/exceljs/+esm", async () => import("exceljs"));

type Row = Record<string, ExcelJS.CellValue>;

declare module "vitest" {
  interface Matchers {
    toBeSheet: (rows: Row[], columns: string[]) => unknown;
  }
}

// Sheets are decorated with a `.columns` property
expect.extend({
  toBeSheet(actual, rows, columns) {
    const actualRows = Array.from(actual, (row: Row) => ({"#": row["#"], ...row}));
    const actualColumns = actual.columns;
    return {
      pass: this.equals(actualRows, rows) && this.equals(actualColumns, columns),
      message: () => `expected sheet to${this.isNot ? " not" : ""} be`,
      actual: {rows: actualRows, columns: actualColumns},
      expected: {rows, columns}
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
    expect(workbook.sheetNames).toStrictEqual(["Sheet1"]);
  });

  test("sheet(name) throws on unknown sheet name", () => {
    const workbook = createWorkbook({Sheet1: []});
    expect(() => workbook.sheet("bad")).toThrowError("Sheet not found");
  });

  test("reads sheets", () => {
    const workbook = createWorkbook({
      Sheet1: [
        ["one", "two", "three"],
        [1, 2, 3]
      ]
    });
    expect(workbook.sheet(0)).toBeSheet(
      [
        {"#": 1, A: "one", B: "two", C: "three"},
        {"#": 2, A: 1, B: 2, C: 3}
      ],
      [..."#ABC"]
    );
    expect(workbook.sheet("Sheet1")).toBeSheet(
      [
        {"#": 1, A: "one", B: "two", C: "three"},
        {"#": 2, A: 1, B: 2, C: 3}
      ],
      [..."#ABC"]
    );
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
      [
        {"#": 1},
        {"#": 2},
        {"#": 3, A: "hello", B: "", C: "0", D: "1"},
        {"#": 4, A: 1, B: 1.2},
        {"#": 5, A: true, B: false},
        {"#": 6, A: new Date(Date.UTC(2020, 0, 1))} // unknown shapes drop
      ],
      [..."#ABCD"]
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
      [
        {
          "#": 1,
          A: "twothree",
          B: `https://example.com?q=" link&</a>"'?`,
          C: "https://example.com"
        }
      ],
      [..."#ABC"]
    );
  });

  test("handles empty hyperlinks", () => {
    const workbook = createWorkbook({
      Sheet1: [
        [
          {text: "", hyperlink: ""},
          {text: "text", hyperlink: ""}
        ]
      ]
    });
    expect(workbook.sheet(0)).toBeSheet([{"#": 1, A: "", B: "text"}], [..."#AB"]);
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
    expect(workbook.sheet(0)).toBeSheet([{"#": 1, A: 10, B: 12, C: NaN}], [..."#ABC"]);
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
      [
        {"#": 2, A: 1, one_: 3, two: 4, A_: 5, 0: "zero"},
        {"#": 3, A: 6, one: 7, one_: 8, two: 9, A_: 10}
      ],
      ["#", "A", "one", "one_", "two", "A_", "0"]
    );
  });

  test("throws on invalid ranges", () => {
    const workbook = createWorkbook({Sheet1: []});
    const malformed = /Malformed range specifier/;
    expect(() => workbook.sheet(0, {range: 0 as unknown as string})).toThrowError(malformed);
    expect(() => workbook.sheet(0, {range: ""})).toThrowError(malformed);
    expect(() => workbook.sheet(0, {range: "-:"})).toThrowError(malformed);
    expect(() => workbook.sheet(0, {range: " :"})).toThrowError(malformed);
    expect(() => workbook.sheet(0, {range: "a1:"})).toThrowError(malformed); // lowercase
    expect(() => workbook.sheet(0, {range: "1A:"})).toThrowError(malformed);
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
    const rows = [
      {"#": 1, A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9},
      {"#": 2, A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 18, J: 19},
      {"#": 3, A: 20, B: 21, C: 22, D: 23, E: 24, F: 25, G: 26, H: 27, I: 28, J: 29},
      {"#": 4, A: 30, B: 31, C: 32, D: 33, E: 34, F: 35, G: 36, H: 37, I: 38, J: 39}
    ];
    const columns = [..."#ABCDEFGHIJ"];
    expect(workbook.sheet(0)).toBeSheet(rows, columns);
    expect(workbook.sheet(0, {range: ":"})).toBeSheet(rows, columns);

    // "B2:C3"
    expect(workbook.sheet(0, {range: "B2:C3"})).toBeSheet(
      [
        {"#": 2, B: 11, C: 12},
        {"#": 3, B: 21, C: 22}
      ],
      [..."#BC"]
    );

    // ":C3"
    expect(workbook.sheet(0, {range: ":C3"})).toBeSheet(
      [
        {"#": 1, A: 0, B: 1, C: 2},
        {"#": 2, A: 10, B: 11, C: 12},
        {"#": 3, A: 20, B: 21, C: 22}
      ],
      [..."#ABC"]
    );

    // "B2:"
    expect(workbook.sheet(0, {range: "B2:"})).toBeSheet(
      [
        {"#": 2, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 18, J: 19},
        {"#": 3, B: 21, C: 22, D: 23, E: 24, F: 25, G: 26, H: 27, I: 28, J: 29},
        {"#": 4, B: 31, C: 32, D: 33, E: 34, F: 35, G: 36, H: 37, I: 38, J: 39}
      ],
      [..."#BCDEFGHIJ"]
    );

    // "H:"
    expect(workbook.sheet(0, {range: "H:"})).toBeSheet(
      [
        {"#": 1, H: 7, I: 8, J: 9},
        {"#": 2, H: 17, I: 18, J: 19},
        {"#": 3, H: 27, I: 28, J: 29},
        {"#": 4, H: 37, I: 38, J: 39}
      ],
      ["#", "H", "I", "J"]
    );

    // ":C"
    expect(workbook.sheet(0, {range: ":C"})).toBeSheet(
      [
        {"#": 1, A: 0, B: 1, C: 2},
        {"#": 2, A: 10, B: 11, C: 12},
        {"#": 3, A: 20, B: 21, C: 22},
        {"#": 4, A: 30, B: 31, C: 32}
      ],
      ["#", "A", "B", "C"]
    );

    // ":Z"
    expect(workbook.sheet(0, {range: ":Z"})).toBeSheet(rows, [..."#ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);

    // "2:"
    expect(workbook.sheet(0, {range: "2:"})).toBeSheet(rows.slice(1), columns);

    // ":2"
    expect(workbook.sheet(0, {range: ":2"})).toBeSheet(rows.slice(0, 2), columns);
  });

  test("derives column names such as A AA AAA…", () => {
    const l0 = 26 * 26 * 23;
    const workbook = createWorkbook({Sheet1: [Array.from<number>({length: l0}).fill(1)]});
    expect(workbook.sheet(0).columns.filter((d: string) => d.match(/^A+$/))).toEqual([
      "A",
      "AA",
      "AAA"
    ]);
  });

  test("headers protects __proto__ of row objects", () => {
    const workbook = createWorkbook({
      Sheet1: [
        ["foo", "__proto__"],
        [1, new Date("2024-01-01")]
      ]
    });
    const [row] = workbook.sheet(0, {headers: true});
    expect(row.foo).toBe(1);
    expect(row.__proto__).toStrictEqual(new Date("2024-01-01"));
    expect(row.getTime).toBe(undefined);
  });
});
