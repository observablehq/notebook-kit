import {assert, test} from "vitest";
import {parseJavaScript} from "./parse.js";

function check(input: string): void {
  parseJavaScript(input);
}

test("allows non-external assignments", () => {
  assert.doesNotThrow(() => check("let foo = 1;\nfoo = 2;"));
  assert.doesNotThrow(() => check("let foo = 1;\nfor (foo of []);"));
});

test("allows external references", () => {
  assert.doesNotThrow(() => check("foo + 1;"));
});

test("does not allow external assignments", () => {
  assert.throws(() => check("foo = 1;"), /external variable 'foo'/);
  assert.throws(() => check("foo++;"), /external variable 'foo'/);
  assert.throws(() => check("++foo;"), /external variable 'foo'/);
  assert.throws(() => check("({foo} = {});"), /external variable 'foo'/);
  assert.throws(() => check("({foo: bar} = {});"), /external variable 'bar'/);
  assert.throws(() => check("([foo] = []);"), /external variable 'foo'/);
  assert.throws(() => check("let foo = 1;\n({...bar} = {});"), /external variable 'bar'/);
  assert.throws(() => check("let foo = 1;\n([...bar] = []);"), /external variable 'bar'/);
  assert.throws(() => check("let foo = 1;\nbar = 1;"), /external variable 'bar'/);
  assert.throws(() => check("function f() { foo = 1; }"), /external variable 'foo'/);
});

test("does not allow external assignments via for…of or for…in", () => {
  assert.throws(() => check("for (foo of []);"), /external variable 'foo'/);
  assert.throws(() => check("for (foo in {});"), /external variable 'foo'/);
});

test("does not allow global assignments", () => {
  assert.throws(() => check("window = 1;"), /Assignment to global 'window'/);
  assert.throws(() => check("const foo = (window = 1);"), /Assignment to global 'window'/);
});

test("does not allow conflicting top-level variables", () => {
  assert.throws(() => check("const window = 1;"), /Global 'window' cannot be redefined/);
  assert.throws(() => check("const foo = 1, window = 2;"), /Global 'window' cannot be redefined/);
  assert.throws(() => check("const {window} = {};"), /Global 'window' cannot be redefined/);
  assert.throws(() => check("const {window = 1} = {};"), /Global 'window' cannot be redefined/);
});

test("allows conflicting non-top-level variables", () => {
  assert.doesNotThrow(() => check("{ const window = 1; }"));
  assert.doesNotThrow(() => check("{ let window; window = 2; }"));
  assert.doesNotThrow(() => check("{ const {window} = {}; }"));
  assert.doesNotThrow(() => check("{ const {window = 1} = {}; }"));
});
