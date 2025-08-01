#!/usr/bin/env node

import {parseArgs} from "node:util";
import {build} from "vite";
import {config, observable} from "../src/vite/index.js";

if (process.argv[1] === import.meta.filename) run();

export default async function run(args?: string[]): Promise<void> {
  const {values, positionals} = parseArgs({
    args,
    allowNegative: true,
    allowPositionals: true,
    options: {
      out: {
        type: "string",
        short: "o",
        default: ".observable/dist"
      },
      root: {
        type: "string",
        default: "."
      },
      base: {
        type: "string",
        default: "./"
      },
      template: {
        type: "string"
      },
      empty: {
        type: "boolean"
      },
      help: {
        type: "boolean",
        short: "h"
      }
    }
  });

  if (values.help) {
    console.log(`usage: notebooks build [files]

  --root <dir>             path to the root directory; defaults to cwd
  --template <path>        path to the HTML template
  -o, --out <dir>          path to the output directory (relative to root)
  --base <path>            serving base path; defaults to ./
  --empty                  whether to empty the output directory before building
  -h, --help               show this message
`);
    return;
  }

  await build({
    ...config(),
    plugins: [observable({template: values.template})],
    root: values.root,
    base: values.base,
    build: {
      outDir: values.out,
      emptyOutDir: values.empty,
      rollupOptions: {
        input: positionals
      }
    }
  });
}
