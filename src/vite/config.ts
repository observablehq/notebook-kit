import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import type {UserConfig} from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function config(): UserConfig {
  return {
    base: "./",
    esbuild: {
      supported: {
        "top-level-await": true
      }
    },
    resolve: {
      alias: [
        {
          find: /^npm:(.*)$/,
          replacement: "https://cdn.jsdelivr.net/npm/$1/+esm"
        },
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
