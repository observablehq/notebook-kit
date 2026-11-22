export function disposable<T>(value: T, dispose: (value: T) => void): Generator<T> {
  if (typeof dispose !== "function") throw new Error("dispose is not a function");
  let done = false;
  let live = true;
  return {
    [Symbol.iterator]() {
      return this;
    },
    [Symbol.dispose]() {
      this.return(undefined);
    },
    next() {
      if (!done) {
        done = true;
        return {done: false, value};
      }
      return {done: true, value: undefined};
    },
    return() {
      done = true;
      if (live) {
        live = false;
        dispose(value);
      }
      return {done: true, value: undefined};
    },
    throw() {
      return this.return(undefined);
    }
  };
}
