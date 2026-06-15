import type {ColumnSchema} from "./databaseClient.js";

/** Accepts dates in the form of ISOString and LocaleDateString, with or without time. */
const DATE_TEST = /^(([-+]\d{2})?\d{4}(-\d{2}(-\d{2}))|(\d{1,2})\/(\d{1,2})\/(\d{2,4}))([T ]\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[-+]\d{2}:\d{2})?)?$/; // prettier-ignore

export function inferSchema(
  source: Record<string, string>[],
  columns = getAllKeys(source)
): ColumnSchema[] {
  const schema: ColumnSchema[] = [];
  const sampleSize = 100;
  const sample = source.slice(0, sampleSize);
  const typeCounts: Record<string, TypeCount> = {};
  for (const col of columns) {
    const colCount = (typeCounts[col] = createTypeCount());
    for (const d of sample) {
      let value = d[col];
      if (value == null) continue;
      // const type = typeof value;
      // if (type !== "string") {
      //   ++colCount.defined;
      //   if (Array.isArray(value)) ++colCount.array;
      //   else if (value instanceof Date) ++colCount.date;
      //   else if (value instanceof ArrayBuffer) ++colCount.buffer;
      //   else if (type === "number") {
      //     ++colCount.number;
      //     if (Number.isInteger(value)) ++colCount.integer;
      //   }
      //   // bigint, boolean, or object
      //   else if (type in colCount) ++colCount[type];
      // } else {
      value = value.trim();
      if (!value) continue;
      ++colCount.defined;
      ++colCount.string;
      if (/^(true|false)$/i.test(value)) {
        ++colCount.boolean;
      } else if (value && !isNaN(Number(value))) {
        ++colCount.number;
        if (Number.isInteger(+value)) ++colCount.integer;
      } else if (DATE_TEST.test(value)) ++colCount.date;
      // }
    }
    // Chose the non-string, non-other type with the greatest count that is also
    // ≥90%; or if no such type meets that criterion, fall back to string if
    // ≥90%; and lastly fall back to other.
    const minCount = Math.max(1, Math.ceil(colCount.defined * 0.9));
    let type: Type = "string";
    let typeCount = minCount - 1;
    console.warn(colCount, typeCount)
    for (const inferrableType of inferrableTypes) {
      if (colCount[inferrableType] > typeCount) {
        type = inferrableType;
        typeCount = colCount[type];
      }
    }
    // if (colCount.string > typeCount) {
    //   type = "string";
    //   typeCount = colCount.string;
    // }
    schema.push({name: col, type});
  }
  return schema;
}

export function enforceSchema(
  source: Record<string, string>[],
  schema: ColumnSchema[]
): Record<string, unknown>[] & {schema: typeof schema} {
  const types = new Map(schema.map(({name, type}) => [name, type]));
  return Object.assign(
    source.map((d) => coerceRow(d, types, schema)),
    {schema}
  );
}

export function coerceRow(
  object: Record<string, unknown>,
  types: Map<string, Type | "raw">,
  schema: ColumnSchema[]
) {
  const coerced: Record<string, unknown> = {};
  for (const col of schema) {
    const type = types.get(col.name)!;
    const value = object[col.name];
    coerced[col.name] = type === "raw" ? value : coerceToType(value, type);
  }
  return coerced;
}

export function coerceToType(value: unknown, type: Type): unknown {
  switch (type) {
    case "string":
      return typeof value === "string" || value == null ? value : String(value);
    case "boolean":
      if (typeof value === "string") {
        const trimValue = value.trim().toLowerCase();
        return trimValue === "true" ? true : trimValue === "false" ? false : null;
      }
      return typeof value === "boolean" || value == null ? value : Boolean(value);
    case "bigint":
      return typeof value === "bigint" || value == null
        ? value
        : Number.isInteger(typeof value === "string" && !value.trim() ? NaN : +value)
          ? BigInt(value as string)
          : undefined;
    case "integer": // not a target type for coercion, but can be inferred
    case "number": {
      return typeof value === "number"
        ? value
        : value == null || (typeof value === "string" && !value.trim())
          ? NaN
          : Number(value);
    }
    case "date": {
      if (value instanceof Date || value == null) return value;
      if (typeof value === "number") return new Date(value);
      const trimValue = String(value).trim();
      if (typeof value === "string" && !trimValue) return null;
      return new Date(DATE_TEST.test(trimValue) ? trimValue : NaN);
    }
    case "array":
    case "object":
    case "buffer":
    case "other":
      return value;
    default:
      throw new Error(`Unable to coerce to type: ${type}`);
  }
}

function createTypeCount(): TypeCount {
  return {
    boolean: 0,
    integer: 0,
    number: 0,
    date: 0,
    string: 0,
    array: 0,
    object: 0,
    bigint: 0,
    buffer: 0,
    defined: 0
  };
}

type TypeCount = Record<Exclude<Type, "other"> | "defined", number>;

export type Type =
  | "boolean"
  | "integer"
  | "number"
  | "date"
  | "bigint"
  | "array"
  | "object"
  | "buffer"
  | "string"
  | "other";

// Caution: the order below matters! 🌶️ The first one that passes the ≥90% test
// should be the one that we chose, and therefore these types should be listed
// from most specific to least specific.
const inferrableTypes: Exclude<Type, "other">[] = [
  "boolean",
  "integer",
  "number",
  "date",
  // "string"
  // "bigint",
  // "array",
  // "object",
  // "buffer"
  // Note: "other" and "string" are intentionally omitted; see below!
];

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
