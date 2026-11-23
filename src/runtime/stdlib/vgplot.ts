import type * as _vgplot from "@uwdata/vgplot";
import type {AsyncDuckDB} from "@duckdb/duckdb-wasm";

export function vg() {
  return [
    ["db", "vgplot"],
    async (db: {_db: AsyncDuckDB}, vgplot: typeof _vgplot) => {
      const coordinator = new vgplot.Coordinator();
      const api = vgplot.createAPIContext({coordinator});
      coordinator.databaseConnector(vgplot.wasmConnector({duckdb: db._db}));
      return api;
    }
  ] as const;
}
