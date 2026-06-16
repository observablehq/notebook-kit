/* eslint-disable @typescript-eslint/no-unused-expressions */

export type Type = "boolean" | "integer" | "number" | "date" | "string";

export interface ColumnSchema {
  /** The name of the column. */
  name: string;
  /** The type of the column. */
  type: Type;
}

/** Accepts dates in the form of ISOString and LocaleDateString, with or without time. */
const DATE_TEST = /^(([-+]\d{2})?\d{4}(-\d{2}(-\d{2}))|(\d{1,2})\/(\d{1,2})\/(\d{2,4}))([T ]\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[-+]\d{2}:\d{2})?)?$/; // prettier-ignore

/** The maximum number of rows to sample (including missing values). */
const SAMPLE_SIZE = 100;

export function inferSchema(
  rows: Record<string, string>[],
  columns = getAllKeys(rows)
): ColumnSchema[] {
  const schema: ColumnSchema[] = [];
  const n = Math.min(rows.length, SAMPLE_SIZE);
  for (const column of columns) {
    let booleans = 0;
    let integers = 0;
    let numbers = 0;
    let dates = 0;
    let strings = 0;

    for (let i = 0; i < n; ++i) {
      const value = rows[i][column]?.trim();
      if (!value) continue;
      ++strings;
      if (/^(true|false)$/i.test(value)) {
        ++booleans;
      } else if (!isNaN(Number(value))) {
        ++numbers;
        if (Number.isInteger(+value)) ++integers;
      } else if (DATE_TEST.test(value)) {
        ++dates;
      }
    }

    // Chose the non-string type with the greatest count that is also ≥90%; or
    // if no such type meets that criterion, use string. Note: integer is more
    // specific than number, and hence should be tested before number.
    let type: Type = "string";
    let typeCount = Math.max(1, Math.ceil(strings * 0.9)) - 1;
    if (booleans > typeCount) ((type = "boolean"), (typeCount = booleans));
    if (integers > typeCount) ((type = "integer"), (typeCount = integers));
    if (numbers > typeCount) ((type = "number"), (typeCount = numbers));
    if (dates > typeCount) ((type = "date"), (typeCount = dates));
    schema.push({name: column, type});
  }
  return schema;
}

export function enforceSchema(
  rows: Record<string, string>[],
  schema: ColumnSchema[]
): Record<string, unknown>[] & {schema: typeof schema} {
  return Object.assign(rows.map((row) => coerceRow(row, schema)), {schema}); // prettier-ignore
}

export function coerceRow(
  input: Record<string, string>,
  schema: ColumnSchema[]
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const {name, type} of schema) output[name] = coerceValue(input[name], type);
  return output;
}

export function coerceValue(value: string, type: Type): unknown {
  switch (type) {
    case "boolean": {
      const trimmed = value.trim().toLowerCase();
      return trimmed === "true" ? true : trimmed === "false" ? false : null;
    }
    case "integer":
    case "number": {
      const trimmed = value.trim();
      return trimmed ? Number(value) : NaN;
    }
    case "date": {
      const trimmed = value.trim();
      return trimmed ? new Date(DATE_TEST.test(trimmed) ? trimmed : NaN) : null;
    }
    default: {
      return value;
    }
  }
}

export function getAllKeys(rows: Record<string, string>[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row != null) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys);
}
