declare module "@observablehq/runtime" {
  type VariableOptions = {shadow?: Record<string, () => unknown>};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type VariableDefinition = (...inputs: any[]) => unknown;
  type ObserverOption = Observer | boolean | null;
  interface Observer {
    pending?(): void;
    fulfilled?(value: unknown): void;
    rejected?(error: unknown): void;
  }
  export class Runtime {
    constructor(library?: unknown);
    _builtin: Module;
    _compute(): Promise<void>;
    module(): Module;
  }
  export class Module {
    _runtime: Runtime;
    _builtins: Map<string, unknown>;
    _scope: Map<string, Variable>;
    _resolve(name: string): Variable;
    variable(observer?: ObserverOption, options?: VariableOptions): Variable;
    define(inputs: string[], definition: VariableDefinition): Variable;
    define(name: string | null, inputs: string[], definition: VariableDefinition): Variable;
  }
  export class Variable {
    _module: Module;
    _observer: ObserverOption;
    _version: number;
    _shadow: Map<string, Variable>;
    _promise: Promise<unknown>;
    _definition: unknown;
    constructor(type: number, module: Module, observer?: ObserverOption, options?: VariableOptions);
    define(inputs: string[], definition: VariableDefinition): Variable;
    define(name: string | null, inputs: string[], definition: VariableDefinition): Variable;
    delete(): Variable;
  }
}
