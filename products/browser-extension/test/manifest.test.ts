import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const productDirectory = join(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(productDirectory, "manifest.json"), "utf8")) as Record<string, unknown>;
const packageJson = JSON.parse(readFileSync(join(productDirectory, "package.json"), "utf8")) as {
  version: string;
  scripts: { build: string };
};
const editorPages = "https://app.roll20.net/editor/*";

interface ContentScript {
  readonly matches: readonly string[];
  readonly js: readonly string[];
  readonly world?: string;
}

const contentScripts = manifest.content_scripts as readonly ContentScript[];

// Section 8: the Roll20 editor only, no network, no remote code, nothing stored.
describe("the extension manifest", () => {
  it("asks for no permission beyond running on the Roll20 editor", () => {
    expect(Object.keys(manifest).filter((key) => /permission|background|externally|web_accessible/u.test(key))).toEqual(
      [],
    );
    expect(contentScripts.flatMap(({ matches }) => matches)).toEqual([editorPages, editorPages]);
  });

  it("runs the bridge in the page's world and the rest in the isolated one (FD15)", () => {
    expect(contentScripts.map(({ js, world }) => [js, world ?? "ISOLATED"])).toEqual([
      [["page_bridge.js"], "MAIN"],
      [["content_script.js"], "ISOLATED"],
    ]);
  });

  it("names exactly the scripts the build produces", () => {
    const builtNames = [...packageJson.scripts.build.matchAll(/(\w+)=src\//gu)].map(
      (match) => `${String(match[1])}.js`,
    );
    expect(contentScripts.flatMap(({ js }) => js).sort()).toEqual(builtNames.sort());
  });

  it("carries the package version, and declares that it collects no data", () => {
    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.browser_specific_settings).toMatchObject({
      gecko: { data_collection_permissions: { required: ["none"] } },
    });
  });

  it("sets the browser floors from FD14's recommendation", () => {
    expect([manifest.minimum_chrome_version, manifest.browser_specific_settings]).toMatchObject([
      "111",
      { gecko: { strict_min_version: "128.0" } },
    ]);
  });
});
