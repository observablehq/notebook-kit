import {assert, describe, it} from "vitest";
import type {Type} from "./dsv";
import {coerceValue, enforceSchema, inferSchema} from "./dsv";

function inferType(values: string[]): Type {
  return inferSchema(values.map((value) => ({value})))[0].type;
}

function enforceType(values: string[], type: Type): unknown[] {
  return enforceSchema(values.map((value) => ({value})), [{name: "value", type}]).map(({value}) => value); // prettier-ignore
}

describe("inferSchema", () => {
  it("infers the union of columns", () => {
    assert.deepStrictEqual(inferSchema([{a: "2"}, {b: "bee"}, {c: "true"}]), [
      {name: "a", type: "integer"},
      {name: "b", type: "string"},
      {name: "c", type: "boolean"}
    ]);
  });
  it("infers integers", () => {
    assert.deepStrictEqual(inferType(["2", "4", "6"]), "integer");
  });
  it("infers numbers", () => {
    assert.deepStrictEqual(inferType(["1.2", "3.4", "5.67"]), "number");
  });
  it("infers numbers with no leading zero", () => {
    assert.deepStrictEqual(inferType([".2", ".4", ".67"]), "number");
  });
  it("infers booleans", () => {
    assert.deepStrictEqual(inferType(["true", "", "false"]), "boolean");
  });
  it("infers dates in common formats", () => {
    assert.deepStrictEqual(inferType(["1/2/20", "2020-11-12 12:23:00", "", "2020-01-12"]), "date");
  });
  it("infers strings", () => {
    assert.deepStrictEqual(inferType(["cat", "dog", "1,000", "null"]), "string");
  });
  it('considers "42n" to be a string, not a bigint', () => {
    assert.deepStrictEqual(inferType(["10n", "22n", "0n"]), "string");
  });
  it("considers (exclusively) empty strings to be strings", () => {
    assert.deepStrictEqual(inferType(["", ""]), "string");
  });
  it("considers mixed integers and numbers to be numbers, not integers", () => {
    assert.deepStrictEqual(inferType([0.1, 1, 2, 3, 9, 10, 11, 12, 13].map(String)), "number");
  });
  it('considers "NaN" to be a string, not a number', () => {
    assert.deepStrictEqual(inferType(["NaN", "NaN", "NaN", "1", "2", "3"]), "string");
  });
  it("infers mostly integers as integers", () => {
    assert.deepStrictEqual(inferType(["x", 1, 2, 3, 9, 1, 1, 1, 3, 2, 3].map(String)), "integer");
  });
  it("infers partly integers as strings", () => {
    assert.deepStrictEqual(inferType(["x", 1, 2, 3, 9, 1, 1, 3].map(String)), "string");
  });
  it("infers mostly numbers as numbers", () => {
    assert.deepStrictEqual(inferType([".0", ".1", "2", "3", "4", "5", "2", "3", ".9", "x"]), "number"); // prettier-ignore
  });
  it("infers partly numbers as strings", () => {
    assert.deepStrictEqual(inferType([".0", ".1", "2", "3", "4", "5", "2", "3", "x"]), "string");
  });
  it("infers mostly booleans as booleans", () => {
    assert.deepStrictEqual(inferType([true, false, true, false, true, false, true, false, true, false, "pants on fire"].map(String)), "boolean"); // prettier-ignore
  });
  it("infers partly booleans as strings", () => {
    assert.deepStrictEqual(inferType([true, false, true, false, true, false, "pants on fire"].map(String)), "string"); // prettier-ignore
  });
});

describe("enforceSchema", () => {
  it("enforces integers", () => {
    assert.deepStrictEqual(enforceType(["1", "2", "4", "3", ""], "integer"), [1, 2, 4, 3, NaN]);
  });
  it("enforces numbers", () => {
    assert.deepStrictEqual(enforceType(["1.2", "4.3", "0.1", ""], "number"), [1.2, 4.3, 0.1, NaN]);
  });
  it("enforces booleans", () => {
    assert.deepStrictEqual(enforceType(["true", "false", ""], "boolean"), [true, false, null]);
  });
  it("enforces dates", () => {
    assert.deepStrictEqual(enforceType(["2002-01-01", "2003-01-01", ""], "date"), [new Date("2002-01-01"), new Date("2003-01-01"), null]); // prettier-ignore
  });
});

describe("coerceValue", () => {
  it("coerces to integer", () => {
    assert.deepStrictEqual(coerceValue("1.2", "integer"), 1.2);
    assert.deepStrictEqual(coerceValue(" 1.2", "integer"), 1.2);
    assert.deepStrictEqual(coerceValue(" 1.2 ", "integer"), 1.2);
    assert.deepStrictEqual(coerceValue("10", "integer"), 10);
    assert.deepStrictEqual(coerceValue("0", "integer"), 0);
    assert.deepStrictEqual(coerceValue("A", "integer"), NaN);
    assert.deepStrictEqual(coerceValue("", "integer"), NaN);
    assert.deepStrictEqual(coerceValue(" ", "integer"), NaN);
    assert.deepStrictEqual(coerceValue("null", "integer"), NaN);
  });
  it("coerces to number", () => {
    assert.deepStrictEqual(coerceValue("1.2", "number"), 1.2);
    assert.deepStrictEqual(coerceValue(" 1.2", "number"), 1.2);
    assert.deepStrictEqual(coerceValue(" 1.2 ", "number"), 1.2);
    assert.deepStrictEqual(coerceValue("0", "number"), 0);
    assert.deepStrictEqual(coerceValue("", "number"), NaN);
    assert.deepStrictEqual(coerceValue(" ", "number"), NaN);
    assert.deepStrictEqual(coerceValue("A", "number"), NaN);
    assert.deepStrictEqual(coerceValue("null", "number"), NaN);
    assert.deepStrictEqual(coerceValue("undefined", "number"), NaN);
    assert.deepStrictEqual(coerceValue("{a: 1}", "number"), NaN);
  });
  it("coerces to boolean", () => {
    assert.deepStrictEqual(coerceValue("true", "boolean"), true);
    assert.deepStrictEqual(coerceValue("True   ", "boolean"), true);
    assert.deepStrictEqual(coerceValue("False", "boolean"), false);
    assert.deepStrictEqual(coerceValue("false", "boolean"), false);
    assert.deepStrictEqual(coerceValue("1", "boolean"), null); // TODO null vs. undefined?
    assert.deepStrictEqual(coerceValue("2", "boolean"), null);
    assert.deepStrictEqual(coerceValue("0", "boolean"), null);
    assert.deepStrictEqual(coerceValue("{}", "boolean"), null);
    assert.deepStrictEqual(coerceValue("null", "boolean"), null);
    assert.deepStrictEqual(coerceValue("undefined", "boolean"), null);
  });
  it("coerces to date", () => {
    const invalidDate = new Date(NaN);
    assert.deepStrictEqual(coerceValue("12/12/2020", "date"), new Date("12/12/2020"));
    assert.deepStrictEqual(coerceValue("12/12/2020  ", "date"), new Date("12/12/2020"));
    assert.deepStrictEqual(coerceValue("2022-01-01T12:34:00Z", "date"), new Date("2022-01-01T12:34:00Z")); // prettier-ignore
    assert.deepStrictEqual(coerceValue("{a: 1}", "date"), invalidDate);
    assert.deepStrictEqual(coerceValue("true", "date"), invalidDate);
    assert.deepStrictEqual(coerceValue("2020-1-12", "date"), invalidDate);
    assert.deepStrictEqual(coerceValue("1675356739000", "date"), invalidDate);
    assert.deepStrictEqual(coerceValue("undefined", "date"), invalidDate);
    assert.deepStrictEqual(coerceValue("", "date"), null);
  });
  it("coerces to string", () => {
    assert.deepStrictEqual(coerceValue("true", "string"), "true");
    assert.deepStrictEqual(coerceValue("false", "string"), "false");
    assert.deepStrictEqual(coerceValue("10", "string"), "10");
    assert.deepStrictEqual(coerceValue("", "string"), "");
    assert.deepStrictEqual(coerceValue(" ", "string"), " ");
  });
});
