import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import type {Plugin, UserConfig} from "vite";
import {resolveNpmImport} from "../javascript/imports/npm.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function config(): UserConfig {
  return {
    base: "./",
    appType: "mpa", // return 404 for missing pages
    plugins: [npmResolver()],
    resolve: {
      alias: [
        {
          find: /^jsr:(.*)$/,
          replacement: "https://esm.sh/jsr/$1"
        },
        {
          find: /^observable:(.*)$/,
          replacement: resolve(__dirname, "../$1")
        }
      ]
    }
  };
}

function npmResolver(): Plugin {
  return {
    name: "notebook-kit:npm-resolver",
    enforce: "pre",
    resolveId(source) {
      if (source.startsWith("npm:")) {
        return {id: resolveNpmImport(source), external: true};
      }
    }
  };
}
