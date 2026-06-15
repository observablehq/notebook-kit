import {assert, describe, it} from "vitest";
import type {Type} from "./dsv";
import {coerceToType, enforceSchema, inferSchema} from "./dsv";

describe("inferSchema", () => {
  function inferType(values: string[]): Type {
    return inferSchema(values.map((value) => ({value})))[0].type;
  }

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
  it.skip("coerces an array of objects", () => {
    const source = [{a: "0", b: "1", c: "2"}];
    assert.deepStrictEqual(
      enforceSchema(source, inferSchema(source)),
      Object.assign([{a: 0, b: 1, c: 2}], {
        schema: [
          {
            name: "a",
            type: "integer"
          },
          {
            name: "b",
            type: "integer"
          },
          {
            name: "c",
            type: "integer"
          }
        ]
      })
    );
  });
});

describe("coerceToType", () => {
  it.skip("coerces to integer", () => {
    // "integer" is not a target type for coercion, but can be inferred. So it
    // will be handled as an alias for "number".
    assert.deepStrictEqual(coerceToType("1.2", "integer"), 1.2);
    assert.deepStrictEqual(coerceToType(" 1.2", "integer"), 1.2);
    assert.deepStrictEqual(coerceToType(" 1.2 ", "integer"), 1.2);
    assert.deepStrictEqual(coerceToType(1.2, "integer"), 1.2);
    assert.deepStrictEqual(coerceToType("10", "integer"), 10);
    assert.deepStrictEqual(coerceToType(0, "integer"), 0);
    assert.deepStrictEqual(coerceToType("A", "integer"), NaN);
    assert.deepStrictEqual(coerceToType("", "integer"), NaN);
    assert.deepStrictEqual(coerceToType(" ", "integer"), NaN);
    assert.deepStrictEqual(coerceToType(null, "integer"), NaN);
  });

  it.skip("coerces to number", () => {
    assert.deepStrictEqual(coerceToType("1.2", "number"), 1.2);
    assert.deepStrictEqual(coerceToType(" 1.2", "number"), 1.2);
    assert.deepStrictEqual(coerceToType(" 1.2 ", "number"), 1.2);
    assert.deepStrictEqual(coerceToType(0, "number"), 0);
    assert.deepStrictEqual(coerceToType("", "number"), NaN);
    assert.deepStrictEqual(coerceToType(" ", "number"), NaN);
    assert.deepStrictEqual(coerceToType("A", "number"), NaN);
    assert.deepStrictEqual(coerceToType(null, "number"), NaN);
    assert.deepStrictEqual(coerceToType(undefined, "number"), NaN);
    assert.deepStrictEqual(coerceToType({a: 1}, "number"), NaN);
  });

  it.skip("coerces to boolean", () => {
    assert.deepStrictEqual(coerceToType("true", "boolean"), true);
    assert.deepStrictEqual(coerceToType("True   ", "boolean"), true);
    assert.deepStrictEqual(coerceToType(true, "boolean"), true);
    assert.deepStrictEqual(coerceToType("False", "boolean"), false);
    assert.deepStrictEqual(coerceToType(false, "boolean"), false);
    assert.deepStrictEqual(coerceToType(1, "boolean"), true);
    assert.deepStrictEqual(coerceToType(2, "boolean"), true);
    assert.deepStrictEqual(coerceToType(0, "boolean"), false);
    assert.deepStrictEqual(coerceToType({}, "boolean"), true);
    assert.deepStrictEqual(coerceToType(new Date(), "boolean"), true);
    assert.deepStrictEqual(coerceToType("A", "boolean"), null);
    assert.deepStrictEqual(coerceToType("", "boolean"), null);
    assert.deepStrictEqual(coerceToType(" ", "boolean"), null);
    assert.deepStrictEqual(coerceToType(null, "boolean"), null);
    assert.deepStrictEqual(coerceToType(undefined, "boolean"), undefined);
  });

  it.skip("coerces to date", () => {
    const invalidDate = new Date(NaN);
    assert.deepStrictEqual(coerceToType("12/12/2020", "date"), new Date("12/12/2020"));
    // with whitespace
    assert.deepStrictEqual(coerceToType("12/12/2020  ", "date"), new Date("12/12/2020"));
    assert.deepStrictEqual(
      coerceToType("2022-01-01T12:34:00Z", "date"),
      new Date("2022-01-01T12:34:00Z")
    );
    assert.deepStrictEqual(coerceToType({a: 1}, "date").toString(), invalidDate.toString());
    assert.deepStrictEqual(coerceToType(true, "date").toString(), invalidDate.toString());
    assert.deepStrictEqual(coerceToType("2020-1-12", "date").toString(), invalidDate.toString());
    assert.deepStrictEqual(coerceToType(1675356739000, "date"), new Date(1675356739000));
    assert.deepStrictEqual(coerceToType(undefined, "date"), undefined);
    assert.deepStrictEqual(coerceToType(null, "date"), null);
    assert.deepStrictEqual(coerceToType("", "date"), null);
    assert.deepStrictEqual(coerceToType(" ", "date"), null);
    assert.deepStrictEqual(
      coerceToType({toString: () => " "}, "date").toString(),
      invalidDate.toString()
    );
    assert.deepStrictEqual(
      coerceToType({toString: () => "2020-01-01"}, "date"),
      new Date("2020-01-01")
    );
  });

  it.skip("coerces to string", () => {
    assert.deepStrictEqual(coerceToType(true, "string"), "true");
    assert.deepStrictEqual(coerceToType(false, "string"), "false");
    assert.deepStrictEqual(coerceToType(10, "string"), "10");
    assert.deepStrictEqual(coerceToType({a: 1}, "string"), "[object Object]");
    assert.deepStrictEqual(coerceToType(0, "string"), "0");
    assert.deepStrictEqual(coerceToType("", "string"), "");
    assert.deepStrictEqual(coerceToType(" ", "string"), " ");
    assert.deepStrictEqual(coerceToType(" foo", "string"), " foo");
    assert.deepStrictEqual(coerceToType(" foo ", "string"), " foo ");
    assert.deepStrictEqual(coerceToType(null, "string"), null);
    assert.deepStrictEqual(coerceToType(undefined, "string"), undefined);
    assert.deepStrictEqual(coerceToType(NaN, "string"), "NaN");
  });

  it.skip("coerces to bigint", () => {
    assert.deepStrictEqual(coerceToType("32", "bigint"), 32n);
    assert.deepStrictEqual(coerceToType(" 32", "bigint"), 32n);
    assert.deepStrictEqual(coerceToType(32n, "bigint"), 32n);
    assert.deepStrictEqual(coerceToType(0, "bigint"), 0n);
    assert.deepStrictEqual(coerceToType(false, "bigint"), 0n);
    assert.deepStrictEqual(coerceToType(true, "bigint"), 1n);
    assert.deepStrictEqual(coerceToType(null, "bigint"), null);
    assert.deepStrictEqual(coerceToType(undefined, "bigint"), undefined);
    assert.deepStrictEqual(coerceToType(1.1, "bigint"), undefined);
    assert.deepStrictEqual(coerceToType("1.1", "bigint"), undefined);
    assert.deepStrictEqual(coerceToType(" 32n", "bigint"), undefined);
    assert.deepStrictEqual(coerceToType("A", "bigint"), undefined);
    assert.deepStrictEqual(coerceToType("", "bigint"), undefined);
    assert.deepStrictEqual(coerceToType(" ", "bigint"), undefined);
    assert.deepStrictEqual(coerceToType(NaN, "bigint"), undefined);
  });

  it.skip("coerces to array", () => {
    // "array" is not a target type for coercion, but can be inferred.
    assert.deepStrictEqual(coerceToType([1, 2, 3], "array"), [1, 2, 3]);
    assert.deepStrictEqual(coerceToType(null, "array"), null);
    assert.deepStrictEqual(coerceToType(undefined, "array"), undefined);
  });

  it.skip("coerces to object", () => {
    // "object" is not a target type for coercion, but can be inferred.
    assert.deepStrictEqual(coerceToType({a: 1, b: 2}, "object"), {a: 1, b: 2});
    assert.deepStrictEqual(coerceToType(null, "object"), null);
    assert.deepStrictEqual(coerceToType(undefined, "object"), undefined);
  });

  it.skip("coerces to buffer", () => {
    // "buffer" is not a target type for coercion, but can be inferred.
    assert.deepStrictEqual(coerceToType(new ArrayBuffer(), "buffer"), new ArrayBuffer());
    assert.deepStrictEqual(coerceToType("A", "buffer"), "A");
    assert.deepStrictEqual(coerceToType(null, "buffer"), null);
    assert.deepStrictEqual(coerceToType(undefined, "buffer"), undefined);
  });

  it.skip("coerces to other", () => {
    // "other" is not a target type for coercion, but can be inferred.
    assert.deepStrictEqual(coerceToType(0, "other"), 0);
    assert.deepStrictEqual(coerceToType("a", "other"), "a");
    assert.deepStrictEqual(coerceToType(null, "other"), null);
    assert.deepStrictEqual(coerceToType(undefined, "other"), undefined);
  });

  // Note: if type is "raw", coerceToType() will not be called. Instead, values
  // will be returned from coerceRow().
});
