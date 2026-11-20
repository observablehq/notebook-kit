import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {IndexHtmlTransformContext, Plugin, ResolvedConfig} from "vite";
import {expect, test} from "vitest";
import {observable} from "./observable.js";

test("registers file attachments under their original name", async () => {
  const root = mkdtempSync(join(tmpdir(), "notebook-kit-"));
  try {
    mkdirSync(join(root, "sub"));
    mkdirSync(join(root, "data"));
    for (const file of ["sub/a.txt", "data/b.csv", "c.txt"]) writeFileSync(join(root, file), "");
    const plugin = observable() as Plugin;
    (plugin.configResolved as (config: ResolvedConfig) => void)({root} as ResolvedConfig);
    const {handler} = plugin.transformIndexHtml as {handler: (html: string, context: IndexHtmlTransformContext) => Promise<string>}; // prettier-ignore
    const html = await handler(
      `<notebook><script id="1" type="module">[FileAttachment("a.txt"), FileAttachment("../data/b.csv"), FileAttachment("/c.txt")]</script></notebook>`,
      {
        path: "/sub/page.html",
        filename: join(root, "sub", "page.html")
      } as IndexHtmlTransformContext
    );
    expect(html.match(/<script type="module">([\s\S]*)<\/script>/)![1]).toMatchSnapshot();
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
