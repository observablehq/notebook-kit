// @vitest-environment jsdom
import {describe, expect, test} from "vitest";
import {MarkdownRenderer} from "./md.js";

describe("MarkdownRenderer", () => {
  test("uses inline elements for node interpolation", () => {
    const md = MarkdownRenderer();
    const foo = document.createElement("span");
    foo.textContent = "foo";
    const bar = document.createElement("span");
    bar.textContent = "bar";

    const result = md`- ${foo} is **bold**\n- ${bar} is _italic_`;

    expect(result.innerHTML).toMatchInlineSnapshot(`
      "<ul>
      <li><span>foo</span> is <strong>bold</strong></li>
      <li><span>bar</span> is <em>italic</em></li>
      </ul>
      "
    `);
  });
});
