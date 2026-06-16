import {assert, describe, it} from "vitest";
import {inferTypes} from "./dsv";
import {coerceBoolean, coerceDate, coerceNumber} from "./dsv";

function inferType(values: string[]): unknown[] {
  return inferTypes(values.map((value) => ({value})), ["value"]).map(({value}) => value); // prettier-ignore
}

describe("inferTypes", () => {
  it("infers numbers", () => {
    assert.deepStrictEqual(inferType(["2", "4", "6"]), [2, 4, 6]);
    assert.deepStrictEqual(inferType(["1.2", "3.4", "5.67"]), [1.2, 3.4, 5.67]);
    assert.deepStrictEqual(inferType([".2", ".4", ".67"]), [0.2, 0.4, 0.67]);
    assert.deepStrictEqual(inferType([0.1, 1, 2, 3, 9].map(String)), [0.1, 1, 2, 3, 9]);
    assert.deepStrictEqual(inferType(["x", 1, 2, 3, 9, 1, 1, 1, 3, 2, 3].map(String)), [NaN, 1, 2, 3, 9, 1, 1, 1, 3, 2, 3]); // prettier-ignore
    assert.deepStrictEqual(inferType([".0", ".1", "2", "3", "4", "5", "2", "3", ".9", "x"]), [0, 0.1, 2, 3, 4, 5, 2, 3, 0.9, NaN]); // prettier-ignore
  });
  it("infers booleans", () => {
    assert.deepStrictEqual(inferType(["true", "", "false"]), [true, null, false]);
    assert.deepStrictEqual(inferType([true, false, true, false, true, false, true, false, true, false, "pants on fire"].map(String)), [true, false, true, false, true, false, true, false, true, false, null]); // prettier-ignore
  });
  it("infers dates in common formats", () => {
    assert.deepStrictEqual(inferType(["1/2/20", "2020-11-12 12:23:00", "", "2020-01-12"]), [new Date("2020-01-02T07:00:00.000Z"), new Date("2020-11-12T19:23:00.000Z"), null, new Date("2020-01-12T00:00:00.000Z")]); // prettier-ignore
  });
  it("infers strings", () => {
    assert.deepStrictEqual(inferType(["cat", "dog", "1,000", "null"]), ["cat", "dog", "1,000", "null"]); // prettier-ignore
    assert.deepStrictEqual(inferType(["10n", "22n", "0n"]), ["10n", "22n", "0n"]);
    assert.deepStrictEqual(inferType(["", ""]), ["", ""]);
    assert.deepStrictEqual(inferType(["NaN", "NaN", "NaN", "1", "2", "3"]), ["NaN", "NaN", "NaN", "1", "2", "3"]); // prettier-ignore
    assert.deepStrictEqual(inferType(["x", 1, 2, 3, 9, 1, 1, 3].map(String)), ["x", 1, 2, 3, 9, 1, 1, 3].map(String)); // prettier-ignore
    assert.deepStrictEqual(inferType([".0", ".1", "2", "3", "4", "5", "2", "3", "x"]), [".0", ".1", "2", "3", "4", "5", "2", "3", "x"]); // prettier-ignore
    assert.deepStrictEqual(inferType([true, false, true, false, true, false, "pants on fire"].map(String)), ["true", "false", "true", "false", "true", "false", "pants on fire"]); // prettier-ignore
  });
});

describe("coerceNumber", () => {
  it("coerces to number", () => {
    assert.deepStrictEqual(coerceNumber("1.2"), 1.2);
    assert.deepStrictEqual(coerceNumber(" 1.2"), 1.2);
    assert.deepStrictEqual(coerceNumber(" 1.2 "), 1.2);
    assert.deepStrictEqual(coerceNumber("10"), 10);
    assert.deepStrictEqual(coerceNumber("0"), 0);
    assert.deepStrictEqual(coerceNumber("A"), NaN);
    assert.deepStrictEqual(coerceNumber(""), NaN);
    assert.deepStrictEqual(coerceNumber(" "), NaN);
    assert.deepStrictEqual(coerceNumber("null"), NaN);
    assert.deepStrictEqual(coerceNumber("1.2"), 1.2);
    assert.deepStrictEqual(coerceNumber(" 1.2"), 1.2);
    assert.deepStrictEqual(coerceNumber(" 1.2 "), 1.2);
    assert.deepStrictEqual(coerceNumber("0"), 0);
    assert.deepStrictEqual(coerceNumber(""), NaN);
    assert.deepStrictEqual(coerceNumber(" "), NaN);
    assert.deepStrictEqual(coerceNumber("A"), NaN);
    assert.deepStrictEqual(coerceNumber("null"), NaN);
    assert.deepStrictEqual(coerceNumber("undefined"), NaN);
    assert.deepStrictEqual(coerceNumber("{a: 1}"), NaN);
  });
});

describe("coerceBoolean", () => {
  it("coerces to boolean", () => {
    assert.deepStrictEqual(coerceBoolean("true"), true);
    assert.deepStrictEqual(coerceBoolean("True   "), true);
    assert.deepStrictEqual(coerceBoolean("False"), false);
    assert.deepStrictEqual(coerceBoolean("false"), false);
    assert.deepStrictEqual(coerceBoolean("1"), null); // TODO null vs. undefined?
    assert.deepStrictEqual(coerceBoolean("2"), null);
    assert.deepStrictEqual(coerceBoolean("0"), null);
    assert.deepStrictEqual(coerceBoolean("{}"), null);
    assert.deepStrictEqual(coerceBoolean("null"), null);
    assert.deepStrictEqual(coerceBoolean("undefined"), null);
  });
});

describe("coerceDate", () => {
  it("coerces to date", () => {
    const invalidDate = new Date(NaN);
    assert.deepStrictEqual(coerceDate("12/12/2020"), new Date("12/12/2020"));
    assert.deepStrictEqual(coerceDate("12/12/2020  "), new Date("12/12/2020"));
    assert.deepStrictEqual(coerceDate("2022-01-01T12:34:00Z"), new Date("2022-01-01T12:34:00Z")); // prettier-ignore
    assert.deepStrictEqual(coerceDate("{a: 1}"), invalidDate);
    assert.deepStrictEqual(coerceDate("true"), invalidDate);
    assert.deepStrictEqual(coerceDate("2020-1-12"), invalidDate);
    assert.deepStrictEqual(coerceDate("1675356739000"), invalidDate);
    assert.deepStrictEqual(coerceDate("undefined"), invalidDate);
    assert.deepStrictEqual(coerceDate(""), null);
  });
});
