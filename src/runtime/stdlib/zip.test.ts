import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import { assert, beforeAll, describe, test, vi } from "vitest";

// Route jszip and exceljs to the versions from devDependencies
vi.mock("https://cdn.jsdelivr.net/npm/jszip/+esm", async () => await import("jszip"));
vi.mock("https://cdn.jsdelivr.net/npm/exceljs/+esm", async () => await import("exceljs"));

const {ZipArchive} = await import("./zip.js");

describe("FileAttachment.zip", () => {
  let zip: import("./zip.js").ZipArchive;

  beforeAll(async () => {
    const fixture = await readFile(
      fileURLToPath(new URL("./zip.test.fixture.zip", import.meta.url))
    );
    zip = await ZipArchive.from(new Uint8Array(fixture).buffer);
  });

  test("filenames lists non-directory entries", () => {
    assert.deepStrictEqual(zip.filenames, [
      "a.txt",
      "b.txt",
      "data.json",
      "test.xlsx",
      "dir/nested.txt"
    ]);
  });

  test("file(path).text() reads contents as a string", async () => {
    assert.strictEqual(await zip.file("a.txt").text(), "alpha");
    assert.strictEqual(await zip.file("dir/nested.txt").text(), "hello");
  });

  test("file(path).json() parses JSON", async () => {
    assert.deepStrictEqual(await zip.file("data.json").json(), {
      a: 1,
      date: "2026-05-11T12:34:56.789Z"
    });
  });

  test("file(path).arrayBuffer() returns the raw bytes", async () => {
    const buffer = await zip.file("b.txt").arrayBuffer();
    assert.strictEqual(new TextDecoder().decode(buffer), "beta");
  });

  test("file(path) throws when the entry is missing", () => {
    assert.throws(() => zip.file("missing.txt"), /file not found/);
  });

  test("file(path) throws when the path is a directory", () => {
    assert.throws(() => zip.file("dir/"), /file not found/);
  });

  test("file(path).xlsx() parses an embedded workbook", async () => {
    const workbook = await zip.file("test.xlsx").xlsx();
    assert.deepStrictEqual(workbook.sheetNames, ["Sheet1"]);
    assert.deepStrictEqual(
      [...workbook.sheet(0)],
      [
        {A: "one", B: "two", C: "three"},
        {A: 1, B: 2, C: 3}
      ]
    );
  });
});
