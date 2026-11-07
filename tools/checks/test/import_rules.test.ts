import { describe, expect, it } from "vitest";
import { findImportViolations } from "../src/import_rules.ts";

function sourceFile(repositoryRelativePath: string, sourceText: string) {
  return { repositoryRelativePath, sourceText };
}

describe("findImportViolations", () => {
  it("rejects domain importing application", () => {
    const violations = findImportViolations([
      sourceFile("shared/domain/attack_roll.ts", 'import { ports } from "../application/ports.ts";'),
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      importerPath: "shared/domain/attack_roll.ts",
      importedSpecifier: "../application/ports.ts",
      category: "layer direction",
    });
  });

  it("rejects domain importing a third party package, since it imports nothing outside itself", () => {
    const violations = findImportViolations([
      sourceFile("shared/domain/attack_roll.ts", 'import lodash from "lodash";'),
    ]);
    expect(violations[0]).toMatchObject({ category: "layer direction" });
  });

  it("allows every import the specification's diagram names", () => {
    const violations = findImportViolations([
      sourceFile("shared/domain/fusion_chain.ts", 'import { roll } from "./attack_roll.ts";'),
      sourceFile("shared/protocol/command_table.ts", 'import { roll } from "../domain/attack_roll.ts";'),
      sourceFile("shared/roll20/ally_interpretation.ts", 'import { roll } from "../domain/index.ts";'),
      sourceFile("shared/application/ports.ts", 'import { table } from "../protocol/index.ts";'),
      sourceFile("shared/application/ports.ts", 'import { roll } from "../domain/index.ts";'),
      sourceFile("shared/testing/doubles.ts", 'import { ports } from "../application/index.ts";'),
      sourceFile("shared/testing/doubles.ts", 'import { reader } from "../roll20/index.ts";'),
    ]);
    expect(violations).toEqual([]);
  });

  it("rejects application importing roll20, which its diagram line does not name", () => {
    const violations = findImportViolations([
      sourceFile("shared/application/ports.ts", 'import { reader } from "../roll20/index.ts";'),
    ]);
    expect(violations[0]).toMatchObject({ category: "layer direction" });
  });

  it("sees an import inside a type only statement", () => {
    const violations = findImportViolations([
      sourceFile("shared/domain/attack_roll.ts", 'import type { Port } from "../application/ports.ts";'),
    ]);
    expect(violations).toHaveLength(1);
  });

  it("ignores an import written inside a comment", () => {
    const violations = findImportViolations([
      sourceFile("shared/domain/attack_roll.ts", '// import { ports } from "../application/ports.ts";'),
    ]);
    expect(violations).toEqual([]);
  });

  it("rejects a product importing the other product by relative path", () => {
    const violations = findImportViolations([
      sourceFile("products/roll20-mod/src/main.ts", 'import { bridge } from "../../browser-extension/src/main.ts";'),
    ]);
    expect(violations[0]).toMatchObject({ category: "cross product" });
  });

  it("rejects a product importing the other product by package name", () => {
    const violations = findImportViolations([
      sourceFile("products/browser-extension/src/main.ts", 'import { mod } from "@fusion20/roll20-mod";'),
    ]);
    expect(violations[0]).toMatchObject({ category: "cross product" });
  });

  it("rejects a product reaching into shared without using a package entry point", () => {
    const violations = findImportViolations([
      sourceFile("products/roll20-mod/src/main.ts", 'import { roll } from "../../../shared/domain/attack_roll.ts";'),
    ]);
    expect(violations[0]).toMatchObject({ category: "entry point" });
  });

  it("rejects a product naming a module below a shared entry point", () => {
    const violations = findImportViolations([
      sourceFile("products/roll20-mod/src/main.ts", 'import { roll } from "@fusion20/shared/domain/attack_roll.ts";'),
    ]);
    expect(violations[0]).toMatchObject({ category: "entry point" });
  });

  it("rejects a test double referenced from product code", () => {
    const violations = findImportViolations([
      sourceFile("products/roll20-mod/src/main.ts", 'import { fakeSource } from "@fusion20/shared/testing";'),
    ]);
    expect(violations[0]).toMatchObject({ category: "test code in product" });
  });

  it("allows a product test to use the shared doubles", () => {
    const violations = findImportViolations([
      sourceFile("products/roll20-mod/test/adapter.test.ts", 'import { suite } from "@fusion20/shared/testing";'),
    ]);
    expect(violations).toEqual([]);
  });

  it("allows a product to use the other shared entry points", () => {
    const violations = findImportViolations([
      sourceFile("products/roll20-mod/src/main.ts", 'import { coordinator } from "@fusion20/shared/application";'),
      sourceFile("products/roll20-mod/src/main.ts", 'import { reader } from "@fusion20/shared/roll20";'),
    ]);
    expect(violations).toEqual([]);
  });
});
