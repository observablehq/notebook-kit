import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import type {UserConfig} from "vite";
import packageJson from "../../package.json" with {type: "json"};
import {resolveNpmImport} from "../javascript/imports/npm.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function config(): UserConfig {
  return {
    base: "./",
    appType: "mpa", // return 404 for missing pages
    esbuild: {
      supported: {
        "top-level-await": true
      }
    },
    resolve: {
      alias: [
        {
          find: /^(npm:.*)$/,
          replacement: "$1",
          customResolver: (source) => ({id: resolveNpmImport(source), external: true})
        },
        {
          find: /^jsr:(.*)$/,
          replacement: "https://esm.sh/jsr/$1"
        },
        {
          find: /^observable:(.*)$/,
          replacement: resolve(__dirname, "../$1")
        },
        // pnpm doesn't hoist our dependencies into the project's node_modules
        ...Object.keys(packageJson.dependencies)
          .filter((name) => name.startsWith("@fontsource-variable/"))
          .map((find) => ({find, replacement: dirname(fileURLToPath(import.meta.resolve(`${find}/package.json`)))})) // prettier-ignore
      ]
    }
  };
}
