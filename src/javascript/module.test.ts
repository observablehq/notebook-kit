import {expect, it} from "vitest";
import {transpileModule} from "./module";
import {toCell} from "../lib/notebook";

it("transpiles modules", async () => {
  await expect(
    transpileModule([
      toCell({value: "const a = 1;\nconst b = 2;", id: 1}),
      toCell({value: "const y = a + b;", id: 2}),
      toCell({value: "Hello, ${y}.", id: 4, mode: "md"}),
      toCell({value: "import {BarChart} from 'observable:@d3/bar-chart';", id: 3})
    ])
  ).toMatchFileSnapshot("__snapshots__/module.js");
});
