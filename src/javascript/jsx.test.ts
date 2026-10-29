import {assert, test} from "vitest";
import {transformJSX} from "./jsx.js";

test("leaves code without JSX unchanged", () => {
  assert.strictEqual(transformJSX("const a = 1 + 2;"), "const a = 1 + 2;");
  assert.strictEqual(transformJSX("f(`a${b}c`, {d, e: [g]});"), "f(`a${b}c`, {d, e: [g]});");
});

test("compiles elements", () => {
  assert.strictEqual(transformJSX("<div />;"), 'JSX.jsx("div", {});');
  assert.strictEqual(transformJSX("<div></div>;"), 'JSX.jsx("div", {});');
});

test("compiles lowercase and dashed names as strings, and others as references", () => {
  assert.strictEqual(transformJSX("<div />;"), 'JSX.jsx("div", {});');
  assert.strictEqual(transformJSX("<my-element />;"), 'JSX.jsx("my-element", {});');
  assert.strictEqual(transformJSX("<Foo />;"), "JSX.jsx(Foo, {});");
  assert.strictEqual(transformJSX("<Foo.Bar.Baz />;"), "JSX.jsx(Foo.Bar.Baz, {});");
  assert.strictEqual(transformJSX("<foo.bar />;"), "JSX.jsx(foo.bar, {});");
  assert.strictEqual(transformJSX("<foo.bar.baz />;"), "JSX.jsx(foo.bar.baz, {});");
  assert.strictEqual(transformJSX("<svg:rect />;"), 'JSX.jsx("svg:rect", {});');
});

test("compiles fragments", () => {
  assert.strictEqual(transformJSX("<></>;"), "JSX.jsx(JSX.Fragment, {});");
  assert.strictEqual(transformJSX("<>a</>;"), 'JSX.jsx(JSX.Fragment, {children: "a"});');
  assert.strictEqual(
    transformJSX("<><a /><b /></>;"),
    'JSX.jsxs(JSX.Fragment, {children: [JSX.jsx("a", {}), JSX.jsx("b", {})]});'
  );
});

test("compiles attributes", () => {
  assert.strictEqual(transformJSX('<a href="x" />;'), 'JSX.jsx("a", {"href": "x"});');
  assert.strictEqual(transformJSX("<a href='x' />;"), 'JSX.jsx("a", {"href": "x"});');
  assert.strictEqual(transformJSX("<a href={x} />;"), 'JSX.jsx("a", {"href": x});');
  assert.strictEqual(transformJSX("<input disabled />;"), 'JSX.jsx("input", {"disabled": true});');
  assert.strictEqual(transformJSX("<a data-x={1} />;"), 'JSX.jsx("a", {"data-x": 1});');
  assert.strictEqual(transformJSX('<a xlink:href="x" />;'), 'JSX.jsx("a", {"xlink:href": "x"});');
  assert.strictEqual(transformJSX('<a b="&amp;" />;'), 'JSX.jsx("a", {"b": "&"});');
  assert.strictEqual(transformJSX("<a b={<c />} />;"), 'JSX.jsx("a", {"b": JSX.jsx("c", {})});');
});

test("compiles spread attributes in order", () => {
  assert.strictEqual(transformJSX("<a {...p} />;"), 'JSX.jsx("a", {...p});');
  assert.strictEqual(transformJSX("<a b={1} {...p} c={2} />;"), 'JSX.jsx("a", {"b": 1, ...p, "c": 2});');
});

test("passes key as a separate argument", () => {
  assert.strictEqual(transformJSX("<li key={id} />;"), 'JSX.jsx("li", {}, id);');
  assert.strictEqual(transformJSX('<li key="a">b</li>;'), 'JSX.jsx("li", {children: "b"}, "a");');
  assert.strictEqual(
    transformJSX("<li key={id} {...p}><a /><b /></li>;"),
    'JSX.jsxs("li", {...p, children: [JSX.jsx("a", {}), JSX.jsx("b", {})]}, id);'
  );
});

test("compiles a single child with jsx and multiple children with jsxs", () => {
  assert.strictEqual(transformJSX("<p>a</p>;"), 'JSX.jsx("p", {children: "a"});');
  assert.strictEqual(transformJSX("<p>{a}</p>;"), 'JSX.jsx("p", {children: a});');
  assert.strictEqual(transformJSX("<p>a{b}</p>;"), 'JSX.jsxs("p", {children: ["a", b]});');
});

test("compiles expression and spread children", () => {
  assert.strictEqual(transformJSX("<p>{a + b}</p>;"), 'JSX.jsx("p", {children: a + b});');
  assert.strictEqual(transformJSX("<p>{...xs}</p>;"), 'JSX.jsx("p", {children: xs});');
  assert.strictEqual(transformJSX("<p>{...xs.map((x) => <i>{x}</i>)}</p>;"), 'JSX.jsx("p", {children: xs.map((x) => JSX.jsx("i", {children: x}))});'); // prettier-ignore
  assert.strictEqual(transformJSX("<p>{}</p>;"), 'JSX.jsx("p", {});');
  assert.strictEqual(transformJSX("<p>{/* comment */}</p>;"), 'JSX.jsx("p", {});');
});

test("follows React's whitespace rules for text", () => {
  assert.strictEqual(transformJSX("<p>  a  b  </p>;"), 'JSX.jsx("p", {children: "  a  b  "});');
  assert.strictEqual(transformJSX("<p>\n  a\n  b\n</p>;"), 'JSX.jsx("p", {children: "a b"});');
  assert.strictEqual(transformJSX("<p>\n  a {b}\n</p>;"), 'JSX.jsxs("p", {children: ["a ", b]});');
  assert.strictEqual(transformJSX("<p>\r\n  a\r\n</p>;"), 'JSX.jsx("p", {children: "a"});');
  assert.strictEqual(transformJSX("<p>\n  <a />\n  <b />\n</p>;"), 'JSX.jsxs("p", {children: [JSX.jsx("a", {}), JSX.jsx("b", {})]});'); // prettier-ignore
  assert.strictEqual(transformJSX("<p>&lt;&#65;&gt;</p>;"), 'JSX.jsx("p", {children: "<A>"});');
});

test("compiles nested JSX within expressions", () => {
  assert.strictEqual(
    transformJSX("<ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;"),
    'JSX.jsx("ul", {children: xs.map((x) => JSX.jsx("li", {children: x}, x))});'
  );
  assert.strictEqual(
    transformJSX("f(<a>{<b />}</a>, `${<c />}`, x ? <d /> : [<e />]);"),
    'f(JSX.jsx("a", {children: JSX.jsx("b", {})}), `${JSX.jsx("c", {})}`, x ? JSX.jsx("d", {}) : [JSX.jsx("e", {})]);'
  );
  assert.strictEqual(
    transformJSX("class A { m() { return <F {...{x: <g />}} />; } }"),
    'class A { m() { return JSX.jsx(F, {...{x: JSX.jsx("g", {})}}); } }'
  );
  assert.strictEqual(
    transformJSX("const {c = <i />} = o;"),
    'const {c = JSX.jsx("i", {})} = o;'
  );
});

test("preserves surrounding code, including shorthand properties", () => {
  assert.strictEqual(transformJSX("const o = {a}; <p />;"), 'const o = {a}; JSX.jsx("p", {});');
  assert.strictEqual(transformJSX("const {b} = o; <p />;"), 'const {b} = o; JSX.jsx("p", {});');
  assert.strictEqual(transformJSX("let c; export {c}; <p />;"), 'let c; export {c}; JSX.jsx("p", {});');
  assert.strictEqual(
    transformJSX("// comment\nconst a = /* b */ <p />;\n"),
    '// comment\nconst a = /* b */ JSX.jsx("p", {});\n'
  );
});

test("compiles JSX within TypeScript, preserving the TypeScript", () => {
  assert.strictEqual(transformJSX("const a: Foo = <p />;"), 'const a: Foo = JSX.jsx("p", {});');
  assert.strictEqual(transformJSX("(<p /> as any);"), '(JSX.jsx("p", {}) as any);');
  assert.strictEqual(transformJSX("<p>{x!}</p>;"), 'JSX.jsx("p", {children: x!});');
  assert.strictEqual(transformJSX("<p>{x satisfies T}</p>;"), 'JSX.jsx("p", {children: x satisfies T});');
  assert.strictEqual(transformJSX("const f = <T,>(x: T) => <p>{x}</p>;"), 'const f = <T,>(x: T) => JSX.jsx("p", {children: x});'); // prettier-ignore
  assert.strictEqual(transformJSX("type T = string; <p />;"), 'type T = string; JSX.jsx("p", {});');
});
