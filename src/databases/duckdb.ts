import type {DuckDBResult, DuckDBType, Json} from "@duckdb/node-api";
import {DuckDBConnection, DuckDBInstance} from "@duckdb/node-api";
import {BIGINT, BIT, BLOB, BOOLEAN, DATE, DOUBLE, FLOAT, HUGEINT, INTEGER, INTERVAL, SMALLINT, TIME, TIMESTAMP, TIMESTAMP_MS, TIMESTAMP_NS, TIMESTAMP_S, TIMESTAMPTZ, TINYINT, UBIGINT, UHUGEINT, UINTEGER, USMALLINT, UTINYINT, UUID, VARCHAR, VARINT} from "@duckdb/node-api"; // prettier-ignore
import type {QueryTemplateFunction} from "./index.js";
import type {ColumnSchema} from "../runtime/index.js";

export type DuckDBConfig = {
  type: "duckdb";
  path?: string;
  options?: {[key: string]: string}; // https://duckdb.org/docs/stable/configuration/overview.html
};

export default function duckdb({path, options}: DuckDBConfig): QueryTemplateFunction {
  return async (strings, ...params) => {
    const instance = await DuckDBInstance.create(path, options);
    const connection = await DuckDBConnection.create(instance);
    const date = new Date();
    let result: DuckDBResult;
    let rows: Record<string, Json>[];
    try {
      result = await connection.run(
        strings.reduce((p, c, i) => `${p}$${i}${c}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params as any[]
      );
      rows = await result.getRowObjectsJson();
    } finally {
      connection.disconnectSync();
      instance.closeSync();
    }
    return {
      rows,
      schema: getResultSchema(result),
      duration: Date.now() - +date,
      date
    };
  };
}

function getResultSchema(result: DuckDBResult): ColumnSchema[] {
  return result.columnNames().map((name, i) => ({name, type: getColumnType(result.columnType(i))}));
}

function getColumnType(type: DuckDBType): ColumnSchema["type"] {
  switch (type) {
    case BOOLEAN:
      return "boolean";
    case BIT:
    case TINYINT:
    case SMALLINT:
    case INTEGER:
    case UTINYINT:
    case USMALLINT:
    case UINTEGER:
    case VARINT:
      return "integer";
    case BIGINT:
    case UBIGINT:
    case HUGEINT:
    case UHUGEINT:
      return "bigint";
    case FLOAT:
    case DOUBLE:
      return "number";
    case TIMESTAMP:
    case TIMESTAMP_S:
    case TIMESTAMP_MS:
    case TIMESTAMP_NS:
    case TIMESTAMPTZ:
    case DATE:
      return "date";
    case TIME:
    case VARCHAR:
    case UUID:
      return "string";
    case BLOB:
      return "buffer";
    case INTERVAL:
      return "array";
    default:
      return "other";
  }
}
