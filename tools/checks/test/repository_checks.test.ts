import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectRepositoryFindings } from "../src/repository_findings.ts";

let plantedRepositoryRoot: string;

// Assembled at run time, since this file is inside the tree the scan reads.
const plantedDashLine = `a phrase ${String.fromCodePoint(0x2013)} another\n`;

async function plantFile(repositoryRelativePath: string, fileText: string): Promise<void> {
  const absolutePath = join(plantedRepositoryRoot, repositoryRelativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, fileText);
}

async function plantBuiltProducts(): Promise<void> {
  const cleanMetafile = JSON.stringify({ inputs: { "src/main.ts": {} } });
  await plantFile("products/roll20-mod/dist/metafile.json", cleanMetafile);
  await plantFile("products/browser-extension/dist/metafile.json", cleanMetafile);
}

// Every line differs so the clone is one long block rather than a run of repeats, which is
// what real copied logic looks like and what a detector can miss.
function tenLinesOfDistinctLogic(functionName: string): string {
  const statements = Array.from({ length: 10 }, (_unused, lineIndex) => {
    return `  const partialTotal${String(lineIndex)} = firstValue * ${String(lineIndex + 2)} + secondValue / ${String(lineIndex + 3)};`;
  });
  return [
    `export function ${functionName}(firstValue: number, secondValue: number) {`,
    ...statements,
    "  return partialTotal9;",
    "}",
    "",
  ].join("\n");
}

function categoriesOf(findings: readonly { category: string }[]): string[] {
  return findings.map((finding) => finding.category);
}

beforeEach(async () => {
  plantedRepositoryRoot = await mkdtemp(join(tmpdir(), "fusion20-planted-"));
  await plantFile("shared/domain/index.ts", "export const placeholderValue = 1;\n");
  await plantBuiltProducts();
});

afterEach(async () => {
  await rm(plantedRepositoryRoot, { recursive: true, force: true });
});

describe("collectRepositoryFindings", () => {
  it("is clean on a tree with no violations", async () => {
    expect(await collectRepositoryFindings(plantedRepositoryRoot)).toEqual([]);
  });

  it("fails on a planted en dash", async () => {
    await plantFile("docs/notes.md", plantedDashLine);
    const findings = await collectRepositoryFindings(plantedRepositoryRoot);
    expect(categoriesOf(findings)).toContain("en dash");
  });

  it("fails on domain importing application", async () => {
    await plantFile("shared/domain/attack_roll.ts", 'import { ports } from "../application/ports.ts";\n');
    const findings = await collectRepositoryFindings(plantedRepositoryRoot);
    expect(categoriesOf(findings)).toContain("layer direction");
  });

  it("fails on a product importing the other product", async () => {
    await plantFile(
      "products/roll20-mod/src/main.ts",
      'import { bridge } from "../../browser-extension/src/main.ts";\n',
    );
    const findings = await collectRepositoryFindings(plantedRepositoryRoot);
    expect(categoriesOf(findings)).toContain("cross product");
  });

  it("fails on a ten line clone across two packages", async () => {
    await plantFile("shared/domain/first_copy.ts", tenLinesOfDistinctLogic("firstCopy"));
    await plantFile("products/roll20-mod/src/second_copy.ts", tenLinesOfDistinctLogic("firstCopy"));
    const findings = await collectRepositoryFindings(plantedRepositoryRoot);
    expect(categoriesOf(findings)).toContain("copied code");
  });

  it("fails on a test double referenced from product code", async () => {
    await plantFile("products/roll20-mod/src/main.ts", 'import { fakeSource } from "@fusion20/shared/testing";\n');
    const findings = await collectRepositoryFindings(plantedRepositoryRoot);
    expect(categoriesOf(findings)).toContain("test code in product");
  });

  it("fails when a product bundle contains shared test code", async () => {
    await plantFile(
      "products/roll20-mod/dist/metafile.json",
      JSON.stringify({ inputs: { "../../shared/testing/doubles.ts": {} } }),
    );
    const findings = await collectRepositoryFindings(plantedRepositoryRoot);
    expect(categoriesOf(findings)).toContain("test code in bundle");
  });

  it("fails when a product has not been built, rather than passing without evidence", async () => {
    await rm(join(plantedRepositoryRoot, "products/browser-extension/dist"), { recursive: true });
    const findings = await collectRepositoryFindings(plantedRepositoryRoot);
    expect(categoriesOf(findings)).toContain("bundle metadata missing");
  });

  it("does not read ignored tool state", async () => {
    await plantFile("node_modules/some-package/notes.md", plantedDashLine);
    await plantFile("thinkings/notes.md", plantedDashLine);
    expect(await collectRepositoryFindings(plantedRepositoryRoot)).toEqual([]);
  });
});
