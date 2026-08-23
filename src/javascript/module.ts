import {Cell} from "../lib/notebook.js";
import type {TranspileOptions} from "./transpile.js";
import {transpile} from "./transpile.js";

// TODO file attachments
export function transpileModule(cells: Cell[], options?: TranspileOptions): string {
  let head = "";
  let body = "";
  body += `export default function define(runtime) {
  const main = runtime.module();${cells
    .map((cell) => {
      const transpiled = transpile(cell, options);
      head += `const _${cell.id} = ${transpiled.body};

`;
      return `
  main.define(${JSON.stringify(`cell ${cell.id}`)}, [${transpiled.inputs?.map((input) => JSON.stringify(input)).join(",") ?? ""}], _${cell.id});${
    transpiled.outputs
      ?.map(
        (output) => `
  main.define(${JSON.stringify(output)}, [${JSON.stringify(`cell ${cell.id}`)}], (_) => _.${output});`
      )
      .join("") ?? ""
  }`;
    })
    .join("")}
  return main;
}
`;
  return head + body;
}
