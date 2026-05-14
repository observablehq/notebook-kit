import {describe, expect, test, vi} from "vitest";
import {require} from "./require.js";

vi.mock("https://cdn.jsdelivr.net/npm/empty/+esm", () => ({}));
vi.mock("https://cdn.jsdelivr.net/npm/string-default/+esm", () => ({default: "hello"}));
vi.mock("https://cdn.jsdelivr.net/npm/named-only/+esm", () => ({h: () => "h"}));
vi.mock("https://cdn.jsdelivr.net/npm/default-only/+esm", () => ({default: {h: () => "h"}}));
vi.mock("https://cdn.jsdelivr.net/npm/combined/+esm", () => ({a: 1, default: {a: 1}}));
vi.mock("https://cdn.jsdelivr.net/npm/mutable-mod/+esm", () => ({default: {count: 0}}));
vi.mock("https://cdn.jsdelivr.net/npm/merge-a/+esm", () => ({a: 1, shared: "a"}));
vi.mock("https://cdn.jsdelivr.net/npm/merge-b/+esm", () => ({b: 2, shared: "b"}));
vi.mock("https://example.com/mod.js", () => ({default: "passthrough", named: 42}));

describe("require", () => {
  test("returns an empty object for a module with no exports", async () => {
    expect(await require("empty")).toEqual({});
  });

  test("extracts a primitive default export", async () => {
    expect(await require("string-default")).toBe("hello");
  });

  test("spreads named-only exports", async () => {
    const mod = (await require("named-only")) as Record<string, unknown>;
    expect(typeof mod.h).toBe("function");
    expect("default" in mod).toBe(false);
  });

  test("extracts a single default export", async () => {
    const mod = (await require("default-only")) as Record<string, unknown>;
    expect(typeof mod.h).toBe("function");
    expect("default" in mod).toBe(false);
  });

  test("keeps default and named exports together when both are present", async () => {
    const mod = await require("combined");
    expect(mod).toEqual({a: 1, default: {a: 1}});
  });

  test("returns the same instance across calls so mutations persist (#138)", async () => {
    const first = (await require("mutable-mod")) as {count: number};
    ++first.count;
    const second = (await require("mutable-mod")) as {count: number};
    expect(second).toBe(first);
    expect(second.count).toBe(1);
  });

  test("merges multiple specifiers in order", async () => {
    const mod = await require("merge-a", "merge-b");
    expect(mod).toEqual({a: 1, b: 2, shared: "b"});
  });

  test("passes through a fully-qualified URL specifier", async () => {
    const mod = (await require("https://example.com/mod.js")) as Record<string, unknown>;
    expect(mod.default).toBe("passthrough");
    expect(mod.named).toBe(42);
  });
});

describe("require.alias", () => {
  test("defines aliases for the returned require", async () => {
    const mod = await require.alias({foo: "merge-a", bar: "merge-b"})("foo", "bar");
    expect(mod).toEqual({a: 1, b: 2, shared: "b"});
  });
  test("defines aliases for the returned require.resolve", async () => {
    expect(require.alias({foo: "bar"}).resolve("foo")).toBe("https://cdn.jsdelivr.net/npm/bar/+esm"); // prettier-ignore
  });
  test("ignores specifiers not given in aliases", async () => {
    expect(require.alias({foo: "bar"}).resolve("baz")).toBe("https://cdn.jsdelivr.net/npm/baz/+esm"); // prettier-ignore
  });
});

describe("require.resolve", () => {
  test("maps npm specifiers to jsdelivr +esm URLs", () => {
    expect(require.resolve("d3")).toBe("https://cdn.jsdelivr.net/npm/d3/+esm");
    expect(require.resolve("d3@^7.1")).toBe("https://cdn.jsdelivr.net/npm/d3@^7.1/+esm");
  });

  // prettier-ignore
  test("maps js file specifiers to jsdelivr +esm URLs", () => {
    expect(require.resolve("d3/dist/d3.js")).toBe("https://cdn.jsdelivr.net/npm/d3/dist/d3.js/+esm");
  });

  // prettier-ignore
  test("maps file specifiers to jsdelivr URLs", () => {
    expect(require.resolve("d3/dist/d3.min.css")).toBe("https://cdn.jsdelivr.net/npm/d3/dist/d3.min.css");
  });

  test("preserves local file specifiers", () => {
    expect(require.resolve("./local.js")).toBe("./local.js");
  });

  test("preserves absolute specifiers", () => {
    expect(require.resolve("https://example.com/mod.js")).toBe("https://example.com/mod.js");
  });
});
