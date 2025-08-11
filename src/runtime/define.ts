import type {Module, Variable, VariableDefinition} from "@observablehq/runtime";
import {Runtime} from "@observablehq/runtime";
import type {DisplayState} from "./display.js";
import {clear, display, observe} from "./display.js";
import {library} from "./stdlib/index.js";
import {input} from "./stdlib/generators/index.js";
import {Mutator} from "./stdlib/mutable.js";
import {fileAttachments} from "./stdlib/fileAttachment.js";

export type DefineState = DisplayState & {
  /** the runtime variables associated with this cell */
  variables: Variable[];
};

export type Definition = {
  /** the unique cell id; a positive integer */
  id: number;
  /** the cell’s definition function */
  body: VariableDefinition;
  /** the names of this cell’s inputs (unbound references), if any */
  inputs?: string[];
  /** the names of this cell’s outputs (top-level declarations), if any */
  outputs?: string[];
  /** the singular output name of this cell, if any; an alternative to outputs */
  output?: string;
  /** whether to display this cell’s singular output automatically */
  autodisplay?: boolean;
  /** whether this cell’s singular output is a view */
  autoview?: boolean;
  /** whether this cell’s singular output is a mutable */
  automutable?: boolean;
  /** an asset mapping to apply to any autodisplayed assets (e.g., images and videos) */
  assets?: Map<string, string>;
};

export class NotebookRuntime {
  readonly runtime: Runtime & {fileAttachments: typeof fileAttachments};
  readonly main: Module;

  constructor(builtins = library) {
    const runtime = new Runtime({...builtins, __ojs_runtime: () => runtime});
    this.runtime = Object.assign(runtime, {fileAttachments});
    this.main = runtime.module();
  }

  define(state: DefineState, definition: Definition, observer = observe): void {
    const {
      id,
      body,
      inputs = [],
      outputs = [],
      output,
      autodisplay,
      autoview,
      automutable
    } = definition;
    const variables = state.variables;
    const v = this.main.variable(observer(state, definition), {shadow: {}});
    const vid = output ?? (outputs.length ? `cell ${id}` : null);
    if (inputs.includes("display") || inputs.includes("view")) {
      let displayVersion = -1; // the variable._version of currently-displayed values
      const vd = new (v.constructor as typeof Variable)(2, v._module);
      vd.define(
        inputs.filter((i) => i !== "display" && i !== "view"),
        () => {
          const version = v._version; // capture version on input change
          return (value: unknown) => {
            if (version < displayVersion) throw new Error("stale display");
            else if (state.variables[0] !== v) throw new Error("stale display");
            else if (version > displayVersion) clear(state);
            displayVersion = version;
            display(state, value);
            return value;
          };
        }
      );
      v._shadow.set("display", vd);
      if (inputs.includes("view")) {
        const vv = new (v.constructor as typeof Variable)(2, v._module, null, {shadow: {}});
        vv._shadow.set("display", vd);
        vv.define(["display"], (display) => (value: unknown) => input(display(value)));
        v._shadow.set("view", vv);
      }
    } else if (!autodisplay) {
      clear(state);
    }
    variables.push(v.define(vid, inputs, body));
    if (output != null) {
      if (autoview) {
        const o = this.unprefix(output, "viewof$");
        variables.push(this.main.define(o, [output], input));
      } else if (automutable) {
        const o = this.unprefix(output, "mutable ");
        const x = `cell ${id}`;
        v.define(o, [x], ([mutable]) => mutable); // observe live value
        variables.push(
          this.main.define(output, inputs, body), // initial value
          this.main.define(x, [output], Mutator),
          this.main.define(`mutable$${o}`, [x], ([, mutator]) => mutator)
        );
      }
    } else {
      for (const o of outputs) {
        variables.push(this.main.variable(true).define(o, [vid!], (exports) => exports[o]));
      }
    }
  }

  protected unprefix(name: string, prefix: string): string {
    if (!name.startsWith(prefix)) throw new Error(`expected ${prefix}: ${name}`);
    return name.slice(prefix.length);
  }
}

const defaultNotebook = new NotebookRuntime();

export const runtime = defaultNotebook.runtime;
export const main = defaultNotebook.main;

main.constructor.prototype.defines = function (this: Module, name: string): boolean {
  return (
    this._scope.has(name) || this._builtins.has(name) || this._runtime._builtin._scope.has(name)
  );
};

export function define(
  state: DefineState,
  definition: Definition,
  observer?: typeof observe
): void {
  defaultNotebook.define(state, definition, observer);
}
