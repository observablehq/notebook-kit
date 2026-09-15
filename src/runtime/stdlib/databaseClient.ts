/* eslint-disable @typescript-eslint/no-explicit-any */
import type {SerializableQueryResult} from "../../databases/index.js";
import {hash, nameHash} from "../../lib/hash.js";

/** @deprecated Use unknown instead. */
export type QueryParam = any;

/** @see https://observablehq.com/@observablehq/database-client-specification#%C2%A71 */
export type QueryResult = Record<string, any>[] & {schema: ColumnSchema[]; date: Date};

/** @see https://observablehq.com/@observablehq/database-client-specification#%C2%A72.2 */
export interface ColumnSchema {
  /** The name of the column. */
  name: string;
  /** The type of the column. */
  type:
    | "string"
    | "number"
    | "integer"
    | "bigint"
    | "date"
    | "boolean"
    | "object"
    | "array"
    | "buffer"
    | "other";
  /** If present, the nullability of the column is known. */
  nullable?: boolean;
}

export interface QueryOptionsSpec {
  /** if present, the id of the cell that owns this database client */
  id?: number;
  /** if present, results are at least as fresh as the specified date */
  since?: Date | string | number;
}

export interface QueryOptions extends QueryOptionsSpec {
  since?: Date;
}

export interface DatabaseClient<T = QueryResult> {
  readonly name: string;
  readonly options: QueryOptions;
  readonly dialect?: string;
  sql<S extends T = T>(strings: readonly string[], ...params: unknown[]): Promise<S>;
}

export const DatabaseClient = (name: string, options?: QueryOptionsSpec): DatabaseClient => {
  return new DatabaseClientImpl(name, normalizeOptions(options));
};

function normalizeOptions({id, since}: QueryOptionsSpec = {}): QueryOptions {
  const options: QueryOptions = {};
  if (id !== undefined) options.id = id;
  if (since !== undefined) options.since = new Date(since);
  return options;
}

class DatabaseClientImpl implements DatabaseClient {
  readonly name!: string;
  readonly options!: QueryOptions;
  constructor(name: string, options: QueryOptions) {
    Object.defineProperties(this, {
      name: {value: name, enumerable: true},
      options: {value: options, enumerable: true}
    });
  }
  async sql<T = QueryResult>(strings: readonly string[], ...params: unknown[]): Promise<T> {
    const path = await this.cachePath(strings, ...params);
    const response = await fetch(path);
    if (!response.ok) throw new Error(`failed to fetch: ${path}`);
    return (await response.json().then(revive)) as T;
  }
  async cachePath(strings: readonly string[], ...params: unknown[]): Promise<string> {
    return `.observable/cache/${await nameHash(this.name)}-${await hash(strings, ...params)}.json`;
  }
}

async function of(source: unknown, name: string): Promise<{sql: DatabaseClient["sql"]}> {
  return source != null &&
    typeof source === "object" &&
    "sql" in source &&
    typeof source["sql"] === "function"
    ? (source as DatabaseClient)
    : (await import("./duckdb.js")).DuckDBClient.of({[name]: source});
}

function revive({rows, schema, date, ...meta}: SerializableQueryResult): QueryResult {
  for (const column of schema) {
    switch (column.type) {
      case "bigint": {
        const {name} = column;
        for (const row of rows) {
          const value = row[name] as string | null;
          if (value == null) continue;
          row[name] = Number(value); // TODO BigInt?
        }
        break;
      }
      case "date": {
        const {name} = column;
        for (const row of rows) {
          const value = row[name] as string | null;
          if (value == null) continue;
          row[name] = asDate(value);
        }
        break;
      }
    }
  }
  if (date != null) date = new Date(date);
  return Object.assign(rows, {schema, date}, meta);
}

function asDate(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(value) ? value + "Z" : value);
}

DatabaseClient.of = of;
DatabaseClient.revive = revive;
DatabaseClient.prototype = DatabaseClientImpl.prototype; // instanceof
Object.defineProperty(DatabaseClientImpl, "name", {value: "DatabaseClient"}); // prevent mangling
