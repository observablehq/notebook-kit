import initSqlJs from "https://cdn.jsdelivr.net/npm/sql.js/+esm";
import type {Database, SqlValue} from "sql.js";
import type {QueryResult} from "./databaseClient.js";
import type {FileAttachment} from "./fileAttachment.js";

type DataSource = string | Uint8Array | ArrayBuffer | Response | FileAttachment;

const SQLite = initSqlJs({
  locateFile(name) {
    return `https://cdn.jsdelivr.net/npm/sql.js/dist/${name}`;
  }
});

export default SQLite;

export class SQLiteDatabaseClient {
  private readonly _db!: Database;
  constructor(db: Database) {
    Object.defineProperty(this, "_db", {value: db});
  }
  static async open(source: DataSource | Promise<DataSource>) {
    const [sqlite, data] = await Promise.all([SQLite, Promise.resolve(source).then(load)]);
    return new SQLiteDatabaseClient(new sqlite.Database(data));
  }
  async sql(strings: TemplateStringsArray, ...params: SqlValue[]): Promise<QueryResult> {
    const [result] = this._db.exec(strings.join("?"), params);
    if (!result) return Object.assign([], {columns: []});
    const {columns, values} = result;
    return Object.assign(values.map((row) => Object.fromEntries(row.map((value, i) => [columns[i], value]))), {columns}); // prettier-ignore
  }
}

function load(source: DataSource): Uint8Array | Promise<Uint8Array> {
  return typeof source === "string"
    ? fetch(source).then(load)
    : isResponseLike(source)
      ? source.arrayBuffer().then(load)
      : source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : source;
}

function isResponseLike(source: DataSource): source is Response | FileAttachment {
  return (
    typeof source === "object" &&
    source != null &&
    "arrayBuffer" in source &&
    typeof source.arrayBuffer === "function"
  );
}

Object.defineProperty(SQLiteDatabaseClient.prototype, "dialect", {value: "sqlite"});
