import {createReadStream} from "node:fs";
import {dirname, join} from "node:path";
import {json} from "node:stream/consumers";
import {isEnoent} from "../lib/error.js";
import {hash, nameHash} from "../lib/hash.js";
import type {ColumnSchema} from "../runtime/index.js";
import type {BigQueryConfig} from "./bigquery.js";
import type {DatabricksConfig} from "./databricks.js";
import type {DuckDBConfig} from "./duckdb.js";
import type {SQLiteConfig} from "./sqlite.js";
import type {SnowflakeConfig} from "./snowflake.js";
import type {PostgresConfig} from "./postgres.js";
import type {MSSQLConfig} from "./mssql.js";

export type DatabaseConfig =
  | BigQueryConfig
  | DatabricksConfig
  | DuckDBConfig
  | SQLiteConfig
  | SnowflakeConfig
  | PostgresConfig
  | MSSQLConfig;

export type QueryTemplateFunction = (
  strings: readonly string[],
  ...params: unknown[]
) => Promise<SerializableQueryResult>;

export type SerializableQueryResult = {
  rows: Record<string, unknown>[];
  schema: ColumnSchema[];
  duration: number;
  date: Date;
};

export async function getDatabaseConfig(
  sourcePath: string,
  databaseName: string
): Promise<DatabaseConfig> {
  const sourceDir = dirname(sourcePath);
  const configPath = join(sourceDir, ".observable", "databases.json");
  let config: DatabaseConfig | undefined;
  try {
    const configStream = createReadStream(configPath, "utf-8");
    const configs = (await json(configStream)) as Record<string, DatabaseConfig>;
    config = configs[databaseName];
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
  if (config === undefined) {
    if (databaseName === "postgres") config = {type: "postgres"};
    else if (databaseName === "duckdb") config = {type: "duckdb"};
    else if (databaseName === "sqlite") config = {type: "sqlite"};
    else if (databaseName === "mssql") config = {type: "mssql"};
    else if (/\.duckdb$/i.test(databaseName)) config = {type: "duckdb", path: databaseName};
    else if (/\.db$/i.test(databaseName)) config = {type: "sqlite", path: databaseName};
    else throw new Error(`database not found: ${databaseName}`);
  }
  return config;
}

export async function getDatabase(config: DatabaseConfig): Promise<QueryTemplateFunction> {
  switch (config.type) {
    case "bigquery":
      return (await import("./bigquery.js")).default(config);
    case "databricks":
      return (await import("./databricks.js")).default(config);
    case "duckdb":
      return (await import("./duckdb.js")).default(config);
    case "sqlite":
      return (await import(process.versions.bun ? "./sqlite-bun.js" : "./sqlite-node.js")).default(config); // prettier-ignore
    case "snowflake":
      return (await import("./snowflake.js")).default(config);
    case "postgres":
      return (await import("./postgres.js")).default(config);
    case "mssql":
      return (await import("./mssql.js")).default(config);
    default:
      throw new Error(`unsupported database type: ${config["type"]}`);
  }
}

export type Replacer = (this: {[key: string]: unknown}, key: string, value: unknown) => unknown;

export async function getReplacer(config: DatabaseConfig): Promise<Replacer | undefined> {
  switch (config.type) {
    case "bigquery":
      return (await import("./bigquery.js")).replacer;
    case "snowflake":
      return (await import("./snowflake.js")).replacer;
  }
}

export async function getQueryCachePath(
  sourcePath: string,
  databaseName: string,
  strings: readonly string[],
  ...params: unknown[]
): Promise<string> {
  const sourceDir = dirname(sourcePath);
  const cacheName = `${await nameHash(databaseName)}-${await hash(strings, ...params)}.json`;
  return join(sourceDir, ".observable", "cache", cacheName);
}
