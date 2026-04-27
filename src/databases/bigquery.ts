import {BigQuery} from "@google-cloud/bigquery";
import {BigQueryDate, BigQueryDatetime, BigQueryTimestamp} from "@google-cloud/bigquery";
import type {TableField, TableSchema} from "@google-cloud/bigquery";
import type {QueryTemplateFunction} from "./index.js";
import type {ColumnSchema} from "../runtime/index.js";

export type BigQueryConfig = {
  type: "bigquery";
  apiKey?: string;
  keyFilename?: string;
  keyFile?: string;
  projectId?: string;
  dataset?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function bigquery({type, dataset, ...options}: BigQueryConfig): QueryTemplateFunction {
  return async (strings, ...params) => {
    const bigquery = new BigQuery(options);
    const date = new Date();
    const [job] = await bigquery.createQueryJob({
      query: strings.join("?"),
      params,
      ...(dataset && {defaultDataset: {datasetId: dataset}}),
    });
    const [rows, , response] = await job.getQueryResults();
    return {rows, schema: getTableSchema(response!.schema!), duration: Date.now() - +date, date};
  };
}

function getTableSchema({fields}: TableSchema): ColumnSchema[] {
  return fields!.map(getColumnSchema);
}

function getColumnSchema(field: TableField): ColumnSchema {
  return {name: field.name!, type: getColumnType(field)};
}

function getColumnType({type, mode}: TableField): ColumnSchema["type"] {
  switch (mode) {
    case "REPEATED":
      return "array";
  }
  switch (type) {
    case "DATE":
    case "DATETIME":
    case "TIMESTAMP":
      return "date";
    case "BOOL":
    case "BOOLEAN":
      return "boolean";
    case "STRUCT":
    case "RECORD":
    case "GEOGRAPHY":
      return "object";
    case "BYTES":
      return "buffer";
    case "FLOAT":
    case "FLOAT64":
      return "number";
    case "INT64":
    case "INTEGER":
      return "number";
    case "NUMERIC":
      return "number";
    case "STRING":
    case "TIME":
    default:
      return "string";
  }
}

export function replacer(this: {[key: string]: unknown}, key: string, value: unknown): unknown {
  const v = this[key];
  return v instanceof BigQueryDate ||
    v instanceof BigQueryDatetime ||
    v instanceof BigQueryTimestamp
    ? new Date(v.value).toJSON()
    : value;
}
