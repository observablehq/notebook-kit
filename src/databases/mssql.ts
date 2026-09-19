import { QueryTemplateFunction } from "./index.js";
import { ColumnSchema } from "../runtime/index.js";
import { optionalNumber, optionalString, optionalBoolean } from "./options.js";

// @ts-expect-error @types/mssql does not cover "arrayRowMode: true" config with columns in the result
import msnodesql from 'mssql/msnodesqlv8.js';

export type MSSQLConfig = {
    type: "mssql";
    connectionString?: string;
    driver?: string;
    server?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    domain?: string;
    requestTimeout?: number;
    connectionTimeout?: number;
    trustedConnection?: boolean;
    trustServerCertificate?: boolean;
    encrypt?: boolean;
    useUTC?: boolean;
    instanceName?: string;
};

export default function mssql(options: MSSQLConfig): QueryTemplateFunction {
    return async (strings, ...params) => {
        const date = new Date();
        await msnodesql.connect({
            connectionString: optionalString(options.connectionString),
            driver: optionalString(options.driver),
            server: optionalString(options.server),
            port: optionalNumber(options.port),
            database: optionalString(options.database),
            user: optionalString(options.user),
            password: optionalString(options.password),
            requestTimeout: optionalNumber(options.requestTimeout),
            connectionTimeout: optionalNumber(options.connectionTimeout),
            arrayRowMode: true,
            options: {
                trustedConnection: optionalBoolean(options.trustedConnection),
                trustServerCertificate: optionalBoolean(options.trustServerCertificate),
                encrypt: optionalBoolean(options.encrypt),
                useUTC: optionalBoolean(options.useUTC),
                instanceName: optionalString(options.instanceName)
            }
        });
        const result = await msnodesql.query(strings, params);
        const columns = result.columns[0];
        const rows = result.recordset.map((row: unknown[]) => {
            const record: Record<string, unknown> = {};
            for(let i = 0; i < columns.length; i++) {
                record[columns[i].name] = row[i];
            }

            return record;
        });
        return {
            rows,
            schema: getResultSchema(columns),
            duration: Date.now() - +date,
            date
        };
    };
}

function getResultSchema(columns: {name: string, type: unknown, nullable: boolean}[]): ColumnSchema[] {
    return columns.map((col: {name: string, type: unknown, nullable: boolean})  => ({name: col.name, type: getColumnType(col.type), nullable: col.nullable }));
}

function getColumnType(type: unknown): ColumnSchema["type"] {
    switch(type) {
        case msnodesql.VarChar:
        case msnodesql.NVarChar:
        case msnodesql.Char:
        case msnodesql.NChar:
        case msnodesql.Xml:
        case msnodesql.Text:
        case msnodesql.BigInt:
        case msnodesql.NText:
            return "string";
        case msnodesql.Int:
        case msnodesql.TinyInt:
        case msnodesql.SmallInt:
            return "integer";
        case msnodesql.Float:
        case msnodesql.Real:
        case msnodesql.Decimal:
        case msnodesql.Numeric:
        case msnodesql.SmallMoney:
        case msnodesql.Money:
            return "number";
        case msnodesql.Bit:
            return "boolean";
        case msnodesql.DateTime:
        case msnodesql.SmallDateTime:
        case msnodesql.DateTimeOffset:
        case msnodesql.Date:
            return "date";
        case msnodesql.Binary:
        case msnodesql.VarBinary:
        case msnodesql.Image:
            return "buffer";
        default:
            return "other";        
    }
}

