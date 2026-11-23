import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleModLibrary, findLibraryProblems, unfilledProblems } from "../mod_library.ts";

const readyScriptJson = {
  name: "Fusion20",
  script: "fusion20.js",
  version: "0.1.0",
  previousversions: ["0.0.1"],
  description: "Tracks fusion criticals.",
  authors: "Someone",
  roll20userid: "12345",
  dependencies: [],
  modifies: { "attribute.current": "read, write" },
  conflicts: [],
};

describe("findLibraryProblems", () => {
  it("finds nothing wrong with a complete script.json", () => {
    expect(findLibraryProblems(readyScriptJson)).toEqual([]);
  });

  it.each([
    [{ script: "fusion20.ts" }, "script must name a .js file"],
    [{ version: "v1" }, "version must be numbers joined by dots"],
    [{ previousversions: ["0.1", "0.1"] }, "previousversions must be distinct version numbers"],
    [{ previousversions: ["beta"] }, "previousversions must be distinct version numbers"],
    [{ modifies: { "graphic.left": "maybe" } }, "modifies must map each property to read, write or both"],
    [{ modifies: [] }, "modifies must map each property to read, write or both"],
    [{ dependencies: [7] }, "dependencies must be a list of script names"],
    [{ conflicts: "Other" }, "conflicts must be a list of script names"],
    [{ authors: "AUTHOR NAME" }, unfilledProblems.authors],
    [{ roll20userid: "AUTHOR ROLL20 USER ID" }, unfilledProblems.roll20userid],
    [{ description: "Draft, for later" }, unfilledProblems.description],
  ])("reports %j", (change, problem) => {
    expect(findLibraryProblems({ ...readyScriptJson, ...change })).toEqual([problem]);
  });

  it("reports a missing required field", () => {
    const withoutAuthors: Record<string, unknown> = { ...readyScriptJson };
    delete withoutAuthors.authors;
    expect(findLibraryProblems(withoutAuthors)).toEqual(["authors is missing", unfilledProblems.authors]);
  });

  it("accepts several authors and user ids", () => {
    expect(findLibraryProblems({ ...readyScriptJson, authors: ["One", "Two"], roll20userid: "1, 2" })).toEqual([]);
  });
});

describe("assembleModLibrary", () => {
  async function prepareSources(scriptJson: Readonly<Record<string, unknown>>) {
    const workDirectory = await mkdtemp(join(tmpdir(), "fusion20-library-"));
    const scriptJsonPath = join(workDirectory, "script.json");
    const bundlePath = join(workDirectory, "bundle.js");
    await writeFile(scriptJsonPath, JSON.stringify(scriptJson));
    await writeFile(bundlePath, "(() => {})();\n");
    return { scriptJsonPath, bundlePath, outputDirectory: join(workDirectory, "release") };
  }

  it("lays out the library folder with the script under its version", async () => {
    const sources = await prepareSources(readyScriptJson);
    const scriptFolder = await assembleModLibrary(sources);
    expect((await readdir(scriptFolder)).sort()).toEqual(["0.1.0", "script.json"]);
    expect(await readFile(join(scriptFolder, "0.1.0", "fusion20.js"), "utf8")).toBe("(() => {})();\n");
    expect(JSON.parse(await readFile(join(scriptFolder, "script.json"), "utf8"))).toEqual(readyScriptJson);
  });

  it("writes nothing while a field is unfilled", async () => {
    const sources = await prepareSources({ ...readyScriptJson, roll20userid: "AUTHOR ROLL20 USER ID" });
    await expect(assembleModLibrary(sources)).rejects.toThrow(unfilledProblems.roll20userid);
    await expect(readdir(sources.outputDirectory)).rejects.toThrow();
  });
});
