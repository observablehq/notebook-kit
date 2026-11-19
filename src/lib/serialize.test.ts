import {JSDOM} from "jsdom";
import {assert, test} from "vitest";
import type {CellSpec, Notebook} from "./notebook.js";
import {toNotebook} from "./notebook.js";
import {deserialize as _deserialize, serialize as _serialize} from "./serialize.js";

const {window} = new JSDOM();

function serialize(notebook: Notebook): string {
  return _serialize(notebook, {document: window.document});
}

function deserialize(data: string): Notebook {
  return _deserialize(data, {parser: new window.DOMParser()});
}

test("serializes unpinned cells", () => {
  const notebook1 = toNotebook({
    cells: [
      {id: 1, mode: "md", pinned: false, value: "# Hello, world!"},
      {id: 2, pinned: false, value: "1 + 2"}
    ]
  });
  const notebook2 = toNotebook({
    cells: [
      {id: 1, mode: "md", pinned: false, value: "# Hello, world!"},
      {id: 2, mode: "js", pinned: false, value: "1 + 2"}
    ]
  });
  assert.deepStrictEqual(deserialize(serialize(notebook1)), notebook2);
});

test("serializes pinned cells", () => {
  const notebook1 = toNotebook({
    cells: [
      {id: 1, mode: "md", pinned: true, value: "# Hello, world!"},
      {id: 2, pinned: true, value: "1 + 2"}
    ]
  });
  const notebook2 = toNotebook({
    cells: [
      {id: 1, mode: "md", pinned: true, value: "# Hello, world!"},
      {id: 2, mode: "js", pinned: true, value: "1 + 2"}
    ]
  });
  assert.deepStrictEqual(deserialize(serialize(notebook1)), notebook2);
});

test("serializes notebook titles", () => {
  const notebook1 = toNotebook({
    title: "Hello, world!",
    cells: [
      {id: 1, mode: "md", pinned: false, value: "# Hello, world!"},
      {id: 2, pinned: true, value: "1 + 2"}
    ]
  });
  const notebook2 = toNotebook({
    title: "Hello, world!",
    cells: [
      {id: 1, mode: "md", pinned: false, value: "# Hello, world!"},
      {id: 2, mode: "js", pinned: true, value: "1 + 2"}
    ]
  });
  assert.deepStrictEqual(deserialize(serialize(notebook1)), notebook2);
});

test("serialization preserves indentation", () => {
  const notebook1 = toNotebook({
    title: "Hello, world!",
    cells: [{id: 2, pinned: true, value: `{\n  1;\n  2;\n}`}]
  });
  const notebook2 = toNotebook({
    title: "Hello, world!",
    cells: [{id: 2, mode: "js", pinned: true, value: `{\n  1;\n  2;\n}`}]
  });
  assert.deepStrictEqual(deserialize(serialize(notebook1)), notebook2);
});

test("serialization escapes </script>, in various forms", () => {
  const notebook1 = toNotebook({
    title: "Hello, world!",
    cells: [
      {id: 2, pinned: true, value: `'</script>'`},
      {id: 3, pinned: true, value: `'</script '`},
      {id: 4, pinned: true, value: `'</SCRIPT '`},
      {id: 5, pinned: true, value: `'</sCrIpT '`},
      {id: 6, pinned: true, value: `'<\\/script>'`},
      {id: 7, pinned: true, value: `'<\\/script '`},
      {id: 8, pinned: true, value: `'<\\\\/SCRIPT '`},
      {id: 9, pinned: true, value: `'<\\\\/sCrIpT '`}
    ]
  });
  const notebook2 = toNotebook({
    title: "Hello, world!",
    cells: [
      {id: 2, mode: "js", pinned: true, value: `'</script>'`},
      {id: 3, mode: "js", pinned: true, value: `'</script '`},
      {id: 4, mode: "js", pinned: true, value: `'</SCRIPT '`},
      {id: 5, mode: "js", pinned: true, value: `'</sCrIpT '`},
      {id: 6, mode: "js", pinned: true, value: `'<\\/script>'`},
      {id: 7, mode: "js", pinned: true, value: `'<\\/script '`},
      {id: 8, mode: "js", pinned: true, value: `'<\\\\/SCRIPT '`},
      {id: 9, mode: "js", pinned: true, value: `'<\\\\/sCrIpT '`}
    ]
  });
  const html = serialize(notebook1);
  assert.strictEqual(html.indexOf("'</script"), -1);
  assert.deepStrictEqual(deserialize(html), notebook2);
});

test("serialization enforces unique ids", () => {
  const notebook1 = toNotebook({
    cells: [
      {id: 2, value: "one"},
      {id: 2, value: "two"}
    ]
  });
  const notebook2 = deserialize(serialize(notebook1));
  assert.strictEqual(notebook2.cells[0].id, 2);
  assert.notStrictEqual(notebook2.cells[1].id, 2);
  assert.ok(notebook2.cells[1].id > 0);
});

test("serializes a light-dark theme as a light-dark() attribute", () => {
  const notebook = toNotebook({theme: {light: "air", dark: "near-midnight"}});
  const html = serialize(notebook);
  assert.ok(html.includes(`<notebook theme="light-dark(air, near-midnight)">`));
  assert.deepStrictEqual(deserialize(html), notebook);
});

test("deserializes a single theme as a string", () => {
  const notebook = deserialize(`<!doctype html><notebook theme="slate"></notebook>`);
  assert.strictEqual(notebook.theme, "slate");
});

test("deserializes a single theme, lower-casing and ignoring whitespace", () => {
  const notebook = deserialize(`<!doctype html><notebook theme=" sLAtE "></notebook>`);
  assert.strictEqual(notebook.theme, "slate");
});

test("deserializes a light-dark() theme attribute", () => {
  const notebook = deserialize(`<!doctype html><notebook theme="light-dark(cotton, slate)"></notebook>`); // prettier-ignore
  assert.deepStrictEqual(notebook.theme, {light: "cotton", dark: "slate"});
});

test("deserializes a light-dark() theme attribute, lower-casing and ignoring whitespace", () => {
  const notebook = deserialize(`<!doctype html><notebook theme=" lIGHt-DaRk(AIR,near-MiDnigHT) "></notebook>`); // prettier-ignore
  assert.deepStrictEqual(notebook.theme, {light: "air", dark: "near-midnight"});
});

test("deserializes a light-dark() theme attribute with inverted preference", () => {
  const notebook = deserialize(`<!doctype html><notebook theme=" lIGHt-DaRk(near-MiDnigHT,AIR) "></notebook>`); // prettier-ignore
  assert.deepStrictEqual(notebook.theme, {dark: "air", light: "near-midnight"});
});

test("deserialization populates missing ids", () => {
  const notebook1 = toNotebook({
    cells: [
      {value: "one"} as CellSpec, // missing id
      {id: 3, value: "three"},
      {value: "four"} as CellSpec // missing id
    ]
  });
  const notebook2 = deserialize(serialize(notebook1));
  const ids = notebook2.cells.map((cell) => cell.id);
  assert.strictEqual(ids[1], 3);
  assert.ok(ids.every((id) => Number.isInteger(id) && id > 0));
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.deepStrictEqual(
    notebook2.cells.map((cell) => cell.value),
    ["one", "three", "four"]
  );
});

test("deserialization assigns missing ids based on cell contents", () => {
  const one = {value: "one"} as CellSpec;
  const two = {value: "two", mode: "md"} as CellSpec;
  const ids1 = deserialize(serialize(toNotebook({cells: [one, two]}))).cells.map((c) => c.id);
  const ids2 = deserialize(serialize(toNotebook({cells: [two, one]}))).cells.map((c) => c.id);
  const ids3 = deserialize(serialize(toNotebook({cells: [{value: "zero"} as CellSpec, one, two]}))).cells.map((c) => c.id); // prettier-ignore
  assert.deepStrictEqual(ids2, [ids1[1], ids1[0]]); // stable when reordered
  assert.deepStrictEqual(ids3.slice(1), ids1); // stable when inserted
  assert.notStrictEqual(ids1[0], ids1[1]);
});

test("deserialization assigns unique ids to cells with the same contents", () => {
  const one = {value: "one"} as CellSpec;
  const ids = deserialize(serialize(toNotebook({cells: [one, one, one]}))).cells.map((c) => c.id); // prettier-ignore
  assert.strictEqual(new Set(ids).size, 3);
  assert.deepStrictEqual(ids, [ids[0], ids[0] + 1, ids[0] + 2]);
});
