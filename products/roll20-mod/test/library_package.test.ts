import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readProductJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8")) as Record<string, unknown>;
}

const scriptJson = await readProductJson("library/script.json");
const packageJson = (await readProductJson("package.json")) as { version: string; scripts: { build: string } };

// The Roll20 Mod library wants a folder named after script.json's name, holding the script under
// a folder named after its version. This keeps the description in step with the build.
describe("the Mod library package", () => {
  it("carries the package version", () => {
    expect(scriptJson.version).toBe(packageJson.version);
  });

  it("names the script the build makes", () => {
    const [builtName] = /(\w+)=src\/main\.ts/u.exec(packageJson.scripts.build)?.slice(1) ?? [];
    expect(scriptJson.script).toBe(`${String(builtName)}.js`);
  });

  it("depends on no other script", () => {
    expect([scriptJson.dependencies, scriptJson.conflicts]).toEqual([[], []]);
  });
});
