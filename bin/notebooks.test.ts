import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {expect, test} from "vitest";
import packageJson from "../package.json" with {type: "json"};

const exec = promisify(execFile);

test("notebooks version prints the version", async () => {
  const {stdout} = await exec("tsx", ["bin/notebooks.ts", "version"]);
  expect(stdout).toBe(`${packageJson.version}\n`);
});
