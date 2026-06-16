/* eslint-disable @typescript-eslint/no-unused-expressions */

/** Accepts dates in the form of ISOString and LocaleDateString, with or without time. */
const DATE_TEST = /^(([-+]\d{2})?\d{4}(-\d{2}(-\d{2}))|(\d{1,2})\/(\d{1,2})\/(\d{2,4}))([T ]\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[-+]\d{2}:\d{2})?)?$/; // prettier-ignore

/** The maximum number of rows to sample (including missing values). */
const SAMPLE_SIZE = 100;

export function inferTypes<T extends Record<string, string>>(
  rows: T[],
  columns: (keyof T)[]
): Record<keyof T, unknown>[] {
  const output = rows as Record<keyof T, unknown>[];
  const n = rows.length;
  const k = Math.min(n, SAMPLE_SIZE);
  for (const column of columns) {
    let booleans = 0;
    let numbers = 0;
    let dates = 0;
    let strings = 0;

    for (let i = 0; i < k; ++i) {
      const value = rows[i][column]?.trim();
      if (!value) continue;
      ++strings;
      if (/^(true|false)$/i.test(value)) ++booleans;
      else if (!isNaN(Number(value))) ++numbers;
      else if (DATE_TEST.test(value)) ++dates;
    }

    // Chose the non-string type with the greatest count that is also ≥90%; or
    // if no such type meets that criterion, use string.
    let coerce: ((value: string) => unknown) | undefined = undefined;
    let typeCount = Math.max(1, Math.ceil(strings * 0.9)) - 1;
    if (booleans > typeCount) ((coerce = coerceBoolean), (typeCount = booleans));
    if (numbers > typeCount) ((coerce = coerceNumber), (typeCount = numbers));
    if (dates > typeCount) ((coerce = coerceDate), (typeCount = dates));
    if (!coerce) continue;

    for (let i = 0; i < n; ++i) {
      output[i][column] = coerce(rows[i][column]);
    }
  }
  return output;
}

export function coerceBoolean(value: string): boolean | null | undefined {
  const trimmed = value.trim().toLowerCase();
  return trimmed === "true" ? true : trimmed === "false" ? false : trimmed ? undefined : null;
}

export function coerceNumber(value: string): number {
  const trimmed = value.trim();
  return trimmed ? Number(value) : NaN;
}

export function coerceDate(value: string): Date | null {
  const trimmed = value.trim();
  return trimmed ? new Date(DATE_TEST.test(trimmed) ? trimmed : NaN) : null;
}
