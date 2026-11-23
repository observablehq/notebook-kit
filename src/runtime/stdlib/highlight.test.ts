// @vitest-environment jsdom
import {expect, test} from "vitest";
import {highlight} from "./highlight.js";

async function highlightAs(language: string, text: string): Promise<HTMLElement> {
  const code = document.createElement("code");
  code.className = `language-${language}`;
  code.textContent = text;
  await highlight(code);
  return code;
}

test("highlights TSX, including JSX and TypeScript (component tags are type names)", async () => {
  const code = await highlightAs("tsx", "const a: number = 1;\n<Foo bar={a as number}>{a}</Foo>");
  expect(code.textContent).toBe("const a: number = 1;\n<Foo bar={a as number}>{a}</Foo>");
  expect(code.querySelector(".tok-invalid")).toBeNull();
  expect(Array.from(code.querySelectorAll(".tok-keyword"), (s) => s.textContent)).toEqual(["const", "number", "Foo", "as", "number", "Foo"]); // prettier-ignore
});
