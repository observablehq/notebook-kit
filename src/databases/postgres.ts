import type {Column, RowList} from "postgres";
import Postgres from "postgres";
import type {ColumnSchema} from "../runtime/index.js";
import type {QueryTemplateFunction} from "./index.js";
import {optionalBoolean, optionalNumber, optionalString} from "./options.js";

export type PostgresConfig = {
  type: "postgres";
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
};

export default function postgres(options: PostgresConfig): QueryTemplateFunction {
  return async (strings, ...params) => {
    const sql = Postgres({
      host: optionalString(options.host),
      port: optionalNumber(options.port),
      username: optionalString(options.username),
      password: optionalString(options.password),
      database: optionalString(options.database),
      ssl: optionalBoolean(options.ssl) ? {rejectUnauthorized: false} : false
    });
    const date = new Date();
    let rows: RowList<Record<string, unknown>[]>;
    try {
      rows = await sql.unsafe(
        strings.reduce((p, c, i) => `${p}$${i}${c}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params as any
      );
    } finally {
      await sql.end();
    }
    return {
      rows,
      schema: rows.columns.map(getColumnSchema),
      duration: Date.now() - +date,
      date
    };
  };
}

function getColumnSchema(column: Column<string>): ColumnSchema {
  return {name: column.name, type: getColumnType(column.type)};
}

// https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js#L166
function getColumnType(oid: number): ColumnSchema["type"] {
  switch (oid) {
    case 20: // int8
      return "bigint";
    case 21: // int2
    case 23: // int4
    case 26: // oid
      return "integer";
    case 700: // float4/real
    case 701: // float8/double
      return "number";
    case 16: // bool
      return "boolean";
    case 1082: // date
    case 1114: // timestamp without timezone
    case 1184: // timestamp
      return "date";
    case 651: // cidr[]
    case 1000: // bool[]
    case 1001: // byte[]
    case 1002: // string[]
    case 1005: // int2[]
    case 1007: // int4[]
    case 1028: // oid[]
    case 1016: // int8[]
    case 1017: // point[]
    case 1021: // float4[]
    case 1022: // float8[]
    case 1231: // numeric[]
    case 1014: // char[]
    case 1015: // varchar[]
    case 1008: // string[]
    case 1009: // string[]
    case 1040: // macaddr[]
    case 1041: // inet[]
    case 1115: // timestamp without time zone[]
    case 1182: // date[]
    case 1185: // timestamp with time zone[]
    case 1187: // interval[]
    case 199: // json[]
    case 3807: // jsonb[]
    case 3907: // numrange[]
    case 2951: // uuid[]
    case 791: // money[]
    case 1183: // time[]
    case 1270: // timetz[]
      return "array";
    case 1186: // interval
    case 114: // json
    case 3802: // jsonb
    case 600: // point
    case 718: // circle
      return "object";
    case 17: // bytea
      return "buffer";
    case 18: // char
    case 1700: // numeric
    case 25: // text
    case 24: // regproc
    default:
      return "string";
  }
}
