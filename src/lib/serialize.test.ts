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

test("deserializes a missing toc attribute as no table of contents", () => {
  const notebook = deserialize(`<!doctype html><notebook theme="slate"></notebook>`);
  assert.strictEqual(notebook.toc, undefined);
});

test("deserializes a bare toc attribute as a float on the right", () => {
  const notebook = deserialize(`<!doctype html><notebook toc></notebook>`);
  assert.deepStrictEqual(notebook.toc, {style: "float", side: "right"});
});

test("deserializes toc words in any order", () => {
  assert.deepStrictEqual(deserialize(`<notebook toc="marks left"></notebook>`).toc, {style: "marks", side: "left"}); // prettier-ignore
  assert.deepStrictEqual(deserialize(`<notebook toc="left marks"></notebook>`).toc, {style: "marks", side: "left"}); // prettier-ignore
  assert.deepStrictEqual(deserialize(`<notebook toc="column"></notebook>`).toc, {style: "column", side: "right"}); // prettier-ignore
});

test("deserializes toc words, ignoring unknown words and keeping the last of each kind", () => {
  const notebook = deserialize(`<notebook toc="wobble column marks right left"></notebook>`);
  assert.deepStrictEqual(notebook.toc, {style: "marks", side: "left"});
});

test("deserializes toc words, lower-casing and ignoring whitespace", () => {
  const notebook = deserialize(`<notebook toc="  Column\n LEFT "></notebook>`);
  assert.deepStrictEqual(notebook.toc, {style: "column", side: "left"});
});

test("serializes toc words in their shortest form", () => {
  const notebook = deserialize(`<notebook toc="LEFT  wobble column"></notebook>`);
  const html = serialize(notebook);
  assert.ok(html.includes(`<notebook theme="air" toc="column left">`));
  assert.deepStrictEqual(deserialize(html), notebook);
});

test("serializes a default toc as an empty attribute", () => {
  const html = serialize(deserialize(`<notebook toc="right"></notebook>`));
  assert.ok(html.includes(`<notebook theme="air" toc="">`));
});

test("serializes no toc attribute without a table of contents", () => {
  const html = serialize(toNotebook({}));
  assert.ok(!html.includes("toc"));
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
