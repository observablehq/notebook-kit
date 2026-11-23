import {normalize as normalizeNode} from "node:path/posix";
import {expect, it} from "vitest";
import {normalize} from "./path.js";

it("normalize matches node:path/posix", () => {
  for (const path of [
    "",
    ".",
    "./",
    "..",
    "../",
    "/",
    "//",
    "///",
    "/.",
    "/..",
    "/../",
    "/../..",
    "foo",
    "foo/",
    "foo//",
    "./foo",
    "../foo",
    "../../foo",
    "foo/..",
    "foo/../",
    "foo/../..",
    "foo/../../bar",
    "foo/./bar",
    "foo//bar",
    "foo/bar/../baz",
    "foo/bar/../../baz",
    "foo/bar/../../../baz",
    "./path/./to/../to/file.txt",
    "/foo/bar",
    "/foo/../bar",
    "/foo/../../bar",
    "//foo//bar//",
    "/./foo/./",
    "...",
    "foo/.../bar",
    ".foo/..bar/",
    "a/b/c/../../../..",
    "a/b/c/../../../../"
  ]) {
    expect(normalize(path), JSON.stringify(path)).toBe(normalizeNode(path));
  }
});
