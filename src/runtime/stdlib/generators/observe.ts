export function observe<T>(
  initialize: (change: (value: T) => void) => (() => void) | void | null | undefined
): ObservableAsyncGenerator<Awaited<T>> {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  let value: T | undefined;
  let stale = false;

  const dispose = initialize((x) => {
    value = x;
    if (resolve != null) {
      resolve(x);
      resolve = reject = undefined;
    } else {
      stale = true;
    }
    return x;
  });

  if (dispose != null && typeof dispose !== "function") {
    throw new Error(
      typeof dispose === "object" && typeof dispose["then"] === "function"
        ? "async initializers are not supported"
        : "initializer returned something, but not a dispose function"
    );
  }

  return {
    async next() {
      return {
        done: false,
        value: await (stale
          ? ((stale = false), value!)
          : new Promise((res, rej) => ((resolve = res), (reject = rej))))
      };
    },
    async return() {
      if (reject != null) {
        reject(new Error("Generator returned"));
        resolve = reject = undefined;
      }
      if (dispose != null) {
        dispose();
      }
      return {done: true, value: undefined};
    },
    async throw(e) {
      if (reject != null) {
        reject(e);
        resolve = reject = undefined;
      }
      if (dispose != null) {
        dispose();
      }
      return {done: true, value: undefined};
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}
