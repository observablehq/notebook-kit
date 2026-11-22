import {describe, it, expect, vi} from "vitest";
import {disposable} from "./disposable.js";

describe("disposable", () => {
  it("throws if dispose is not a function", () => {
    expect(() => disposable(1, null as never)).toThrow(/dispose is not a function/);
    expect(() => disposable(1, undefined as never)).toThrow(/dispose is not a function/);
  });

  it("yields the value once, then is done", () => {
    const value = {};
    const g = disposable(value, () => {});
    expect(g.next()).toEqual({done: false, value});
    expect(g.next()).toEqual({done: true, value: undefined});
    expect(g.next()).toEqual({done: true, value: undefined});
  });

  it("is iterable", () => {
    const g = disposable(42, () => {});
    expect(g[Symbol.iterator]()).toBe(g);
    expect([...disposable(42, () => {})]).toEqual([42]);
  });

  it("does not dispose until returned", () => {
    const dispose = vi.fn();
    const g = disposable(1, dispose);
    g.next();
    g.next();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposes the value on return after the value was yielded", () => {
    // This is how the runtime uses generators: next(), then return() on invalidation.
    const value = {};
    const dispose = vi.fn();
    const g = disposable(value, dispose);
    expect(g.next().value).toBe(value);
    expect(g.return(undefined)).toEqual({done: true, value: undefined});
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(value);
  });

  it("disposes the value on return after the generator is exhausted", () => {
    const dispose = vi.fn();
    const g = disposable(1, dispose);
    g.next();
    g.next();
    g.return(undefined);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(1);
  });

  it("disposes the value on return before the value was yielded", () => {
    const dispose = vi.fn();
    const g = disposable(1, dispose);
    expect(g.return(undefined)).toEqual({done: true, value: undefined});
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(1);
    expect(g.next()).toEqual({done: true, value: undefined});
  });

  it("disposes at most once", () => {
    const dispose = vi.fn();
    const g = disposable(1, dispose);
    g.next();
    g.return(undefined);
    g.return(undefined);
    g.throw(new Error("oops"));
    g[Symbol.dispose]();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes the value on throw", () => {
    const dispose = vi.fn();
    const g = disposable(1, dispose);
    g.next();
    expect(g.throw(new Error("oops"))).toEqual({done: true, value: undefined});
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(1);
    expect(g.next()).toEqual({done: true, value: undefined});
  });

  it("disposes the value via Symbol.dispose", () => {
    const dispose = vi.fn();
    const g = disposable(1, dispose);
    g.next();
    g[Symbol.dispose]();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(1);
    expect(g.next()).toEqual({done: true, value: undefined});
  });

  it("disposes when a for-of loop exits early", () => {
    const dispose = vi.fn();
    for (const x of disposable(1, dispose)) {
      expect(x).toBe(1);
      break;
    }
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("does not dispose when a for-of loop completes normally", () => {
    // Completing iteration does not call return(); the runtime disposes on invalidation.
    const dispose = vi.fn();
    for (const x of disposable(1, dispose)) expect(x).toBe(1);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("propagates errors thrown by dispose", () => {
    const g = disposable(1, () => {
      throw new Error("dispose failed");
    });
    g.next();
    expect(() => g.return(undefined)).toThrow(/dispose failed/);
  });

  it("does not dispose again after dispose throws", () => {
    const dispose = vi.fn(() => {
      throw new Error("dispose failed");
    });
    const g = disposable(1, dispose);
    g.next();
    expect(() => g.return(undefined)).toThrow(/dispose failed/);
    expect(g.return(undefined)).toEqual({done: true, value: undefined});
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("does not dispose again if dispose re-enters return", () => {
    const dispose = vi.fn(() => void g.return(undefined));
    const g = disposable(1, dispose);
    g.next();
    expect(g.return(undefined)).toEqual({done: true, value: undefined});
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
