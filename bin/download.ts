#!/usr/bin/env node

import {parseArgs} from "node:util";
import {JSDOM} from "jsdom";
import {toNotebook} from "../src/lib/notebook.js";
import {serialize} from "../src/lib/serialize.js";

const UI_ORIGIN = "https://observablehq.com";
const API_ORIGIN = "https://api.observablehq.com";

if (process.argv[1] === import.meta.filename) run();

export default async function run(args?: string[]) {
  const {values, positionals} = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: {
        type: "boolean",
        short: "h"
      }
    }
  });

  if (positionals.length !== 1 && !values.help) throw new Error("missing <url>");

  if (values.help) {
    console.log(`usage: notebooks download <url>

  -h, --help               show this message
`);
    return;
  }

  const {window} = new JSDOM();
  for (const positional of positionals) {
    let url = new URL(positional, UI_ORIGIN);
    if (url.origin === UI_ORIGIN) {
      url = new URL(`/document${url.pathname.replace(/^\/d\//, "/")}`, API_ORIGIN);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`unable to fetch: ${url}`);
    const {title, nodes} = await response.json();
    for (const node of nodes) if (node.mode === "js") node.mode = "ojs";
    process.stdout.write(serialize(toNotebook({title, cells: nodes}), {document: window.document}));
  }
}
