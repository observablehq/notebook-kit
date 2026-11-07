import type {Module} from "@observablehq/runtime";
import {Runtime} from "@observablehq/runtime";
import type {DefineState, Definition} from "./define.js";
import {define as _define} from "./define.js";
import type {observe} from "./display.js";
import {fileAttachments, fileDatabase} from "./stdlib/fileAttachment.js";
import {library} from "./stdlib/index.js";

export type {DefineState, Definition} from "./define.js";
export * from "./display.js";
export * from "./inspect.js";
export * from "./stdlib/index.js";
export type * from "./stdlib/databaseClient.js";
export {DatabaseClient} from "./stdlib/databaseClient.js";
export type * from "./stdlib/fileAttachment.js";
export {FileAttachment} from "./stdlib/fileAttachment.js";
export {requireFileRegistration, registerFile} from "./stdlib/fileAttachment.js";
export type * from "./stdlib/interpreter.js";
export {Interpreter} from "./stdlib/interpreter.js";
export {sql} from "./stdlib/sql.js";

type RuntimeExtras = {
  fileAttachments: typeof fileAttachments;
  fileDatabase: typeof fileDatabase;
};

export class NotebookRuntime {
  readonly runtime: Runtime & RuntimeExtras;
  readonly main: Module;

  constructor(builtins: Record<string, () => unknown> = library) {
    const runtime = new Runtime(builtins);
    this.runtime = Object.assign(runtime, {fileAttachments, fileDatabase});
    this.main = runtime.module();
    this.main.builtin("db", ...fileDatabase());
  }

  define(state: DefineState, definition: Definition, observer?: typeof observe): void {
    _define(this.main, state, definition, observer);
  }
}

const defaultNotebook = new NotebookRuntime();

export const runtime = defaultNotebook.runtime;
export const main = defaultNotebook.main;
export const define = defaultNotebook.define.bind(defaultNotebook);

main.constructor.prototype.defines = function (this: Module, name: string): boolean {
  return (
    this._scope.has(name) || // prettier
    this._builtins.has(name) ||
    this._runtime._builtin._scope.has(name)
  );
};
