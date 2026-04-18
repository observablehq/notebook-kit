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
  const notebook2 = toNotebook({
    cells: [
      {id: 2, value: "one"},
      {id: 3, value: "two"}
    ]
  });
  assert.deepStrictEqual(deserialize(serialize(notebook1)), notebook2);
});

test("serializes a theme array as a space-separated attribute", () => {
  const notebook = toNotebook({theme: ["air", "near-midnight"]});
  const html = serialize(notebook);
  assert.match(html, /<notebook theme="air near-midnight">/);
  assert.deepStrictEqual(deserialize(html), notebook);
});

test("deserializes a single theme as a string", () => {
  const notebook = deserialize(`<!doctype html><notebook theme="slate"></notebook>`);
  assert.strictEqual(notebook.theme, "slate");
});

test("deserializes a space-separated theme attribute as an array", () => {
  const notebook = deserialize(`<!doctype html><notebook theme="air near-midnight"></notebook>`);
  assert.deepStrictEqual(notebook.theme, ["air", "near-midnight"]);
});

test("deserialization populates missing ids", () => {
  const notebook1 = toNotebook({
    cells: [
      {value: "one"} as CellSpec, // missing id
      {id: 3, value: "three"},
      {value: "four"} as CellSpec // missing id
    ]
  });
  const notebook2 = toNotebook({
    cells: [
      {id: 1, value: "one"},
      {id: 3, value: "three"},
      {id: 4, value: "four"}
    ]
  });
  assert.deepStrictEqual(deserialize(serialize(notebook1)), notebook2);
});
