#!/usr/bin/env node

import {parseArgs} from "node:util";
import {createServer} from "vite";
import {config, observable} from "../src/vite/index.js";

if (process.argv[1] === import.meta.filename) run();

export default async function run(args?: string[]): Promise<void> {
  const {values} = parseArgs({
    args,
    allowNegative: true,
    options: {
      root: {
        type: "string",
        default: "."
      },
      base: {
        type: "string",
        default: "/"
      },
      template: {
        type: "string"
      },
      help: {
        type: "boolean",
        short: "h"
      }
    }
  });

  if (values.help) {
    console.log(`usage: notebooks preview

  --root <dir>             path to the root directory; defaults to cwd
  --template <path>        path to the HTML template
  --base <path>            serving base path; defaults to /
  -h, --help               show this message
`);
    return;
  }

  const server = await createServer({
    ...config(),
    plugins: [observable({template: values.template})],
    root: values.root,
    base: values.base
  });

  await server.listen();
  server.printUrls();
  server.bindCLIShortcuts({print: true});
}
