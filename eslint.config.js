import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import {defineConfig} from "eslint/config";
import {builtinModules} from "node:module";

export default defineConfig([
  {files: ["**/*.{js,ts,jsx,tsx}"], plugins: {js}, extends: ["js/recommended"]},
  {files: ["**/*.{js,ts,jsx,tsx}"], languageOptions: {globals: globals.browser}},
  {files: ["src/{javascript,lib,runtime}/**/*.{js,ts}"], ignores: ["**/*.test.ts"], rules: {"no-restricted-imports": ["error", {paths: builtinModules, patterns: ["node:*"]}]}}, // prettier-ignore
  tseslint.configs.recommended
]);
