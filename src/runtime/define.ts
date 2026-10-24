import type {Module, Variable, VariableDefinition} from "@observablehq/runtime";
import {unprefix} from "../lib/unprefix.js";
import type {DisplayState, DisplayMode} from "./display.js";
import {clear, display, observe} from "./display.js";
import {input} from "./stdlib/generators/index.js";
import {Mutator} from "./stdlib/mutable.js";

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
  /** whether to define the display and view builtins; defaults to true */
  display?: boolean;
  /** whether to use the default inspector, or the special table display (for SQL cells) */
  displayMode?: DisplayMode;
  /** an asset mapping to apply to any autodisplayed assets (e.g., images and videos) */
  assets?: Map<string, string>;
};

export function define(
  main: Module,
  state: DefineState,
  definition: Definition,
  observer = observe
): void {
  const {id, body, inputs = [], outputs = [], output, displayMode} = definition;
  const {autodisplay, autoview, automutable, display: defineDisplay = true} = definition;
  const variables = state.variables;
  const v = main.variable(observer(state, definition), {shadow: {}});
  const vid = output ?? (outputs.length ? `cell ${id}` : null);
  state.autoclear = true;
  if (defineDisplay && (inputs.includes("display") || inputs.includes("view"))) {
    let displayVersion = -1; // the variable._version of currently-displayed values
    const vd = new (v.constructor as typeof Variable)(2, v._module);
    vd.define(
      inputs.filter((i) => i !== "display" && i !== "view"),
      () => {
        const version = v._version; // capture version on input change
        return (...values: unknown[]) => {
          if (version < displayVersion) throw new Error("stale display");
          else if (state.variables[0] !== v) throw new Error("stale display");
          else if (version > displayVersion) clear(state);
          displayVersion = version;
          for (const value of values) display(state, value, output, displayMode);
          return values.length === 1 ? values[0] : values;
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
      const o = unprefix(output, "viewof$");
      variables.push(main.define(o, [output], input));
    } else if (automutable) {
      const o = unprefix(output, "initial ");
      const x = `cell ${id}`;
      v.define(o, [x], ([mutable]) => mutable); // observe live value
      variables.push(
        main.define(output, inputs, body), // initial value
        main.define(x, [output], Mutator),
        main.define(`mutable$${o}`, [x], ([, mutator]) => mutator)
      );
    }
  } else {
    for (const o of outputs) {
      variables.push(main.variable(true).define(o, [vid!], (exports) => exports[o]));
    }
  }
}
