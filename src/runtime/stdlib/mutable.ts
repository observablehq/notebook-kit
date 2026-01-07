import {observe} from "./generators/observe.js";

// Mutable returns a generator with a value getter/setting that allows the
// generated value to be mutated. Therefore, direct mutation is only allowed
// within the defining cell, but the cell can also export functions that allows
// other cells to mutate the value as desired.
export function Mutable<T>(value: T): ObservableAsyncGenerator<Awaited<T>> & {value: T} {
  let change: (value: T) => void;
  return Object.defineProperty(
    observe((_: (value: T) => void) => {
      change = _;
      if (value !== undefined) change(value);
    }),
    "value",
    {
      get: () => value,
      set: (x) => ((value = x), void change?.(value))
    }
  ) as ObservableAsyncGenerator<Awaited<T>> & {value: T};
}

export function Mutator<T>(value: T) {
  const mutable = Mutable<T>(value);
  return [
    mutable,
    {
      get value() {
        return mutable.value;
      },
      set value(v) {
        mutable.value = v;
      }
    }
  ];
}
