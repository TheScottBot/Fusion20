import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The Roll20 Mod library checks script.json against its script.json.schema, read from the
// Roll20/roll20-api-scripts repository on 23 November 2026. These are the rules of that schema
// this package could break, plus the fields a person must fill in before submission.

const requiredFields = ["name", "description", "script", "version", "authors", "roll20userid"];
const versionPattern = /^([0-9]+(\.)?)+([0-9]+)?$/u;
const userIdPattern = /^([0-9]+,[ ]?)*[0-9]+$/u;
const accessValues = ["read", "write", "read, write", "write, read", "read,write", "write,read"];

export const unfilledProblems = {
  authors: "authors still holds the placeholder",
  roll20userid: "roll20userid is not a list of Roll20 user ids",
  description: "description is still marked as a draft",
} as const;

function isStringList(candidate: unknown): boolean {
  return Array.isArray(candidate) && candidate.every((entry) => typeof entry === "string");
}

export function findLibraryProblems(scriptJson: Readonly<Record<string, unknown>>): string[] {
  const problems = requiredFields.filter((field) => !(field in scriptJson)).map((field) => `${field} is missing`);
  const { script, version, previousversions, modifies, dependencies, conflicts, authors, roll20userid, description } =
    scriptJson;
  if (typeof script !== "string" || !script.endsWith(".js")) {
    problems.push("script must name a .js file");
  }
  if (typeof version !== "string" || !versionPattern.test(version)) {
    problems.push("version must be numbers joined by dots");
  }
  if (
    previousversions !== undefined &&
    (!isStringList(previousversions) ||
      !(previousversions as string[]).every((entry) => versionPattern.test(entry)) ||
      new Set(previousversions as string[]).size !== (previousversions as string[]).length)
  ) {
    problems.push("previousversions must be distinct version numbers");
  }
  const accessEntries = typeof modifies === "object" && modifies !== null ? Object.values(modifies) : [null];
  if (Array.isArray(modifies) || !accessEntries.every((access) => accessValues.includes(String(access)))) {
    problems.push("modifies must map each property to read, write or both");
  }
  for (const [field, list] of [
    ["dependencies", dependencies],
    ["conflicts", conflicts],
  ] as const) {
    if (list !== undefined && !isStringList(list)) {
      problems.push(`${field} must be a list of script names`);
    }
  }
  if (authors === "AUTHOR NAME" || (typeof authors !== "string" && !isStringList(authors))) {
    problems.push(unfilledProblems.authors);
  }
  if (typeof roll20userid !== "string" || !userIdPattern.test(roll20userid)) {
    problems.push(unfilledProblems.roll20userid);
  }
  if (typeof description !== "string" || description.startsWith("Draft")) {
    problems.push(unfilledProblems.description);
  }
  return problems;
}

export interface ModLibrarySources {
  readonly scriptJsonPath: string;
  readonly bundlePath: string;
  readonly outputDirectory: string;
}

// The library's layout: a folder named after the script, holding script.json and the script in
// a folder named after its version. Nothing is written while any problem remains.
export async function assembleModLibrary({
  scriptJsonPath,
  bundlePath,
  outputDirectory,
}: ModLibrarySources): Promise<string> {
  const scriptJson = JSON.parse(await readFile(scriptJsonPath, "utf8")) as Record<string, unknown>;
  const problems = findLibraryProblems(scriptJson);
  if (problems.length > 0) {
    throw new Error(`The Mod library package is not ready:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  }
  const scriptFolder = join(outputDirectory, String(scriptJson.name));
  const versionFolder = join(scriptFolder, String(scriptJson.version));
  await mkdir(versionFolder, { recursive: true });
  await writeFile(join(scriptFolder, "script.json"), `${JSON.stringify(scriptJson, null, 2)}\n`);
  await copyFile(bundlePath, join(versionFolder, String(scriptJson.script)));
  return scriptFolder;
}
