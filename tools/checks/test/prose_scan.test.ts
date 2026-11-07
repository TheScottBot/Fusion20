import { describe, expect, it } from "vitest";
import { findProseViolations } from "../src/prose_scan.ts";

// Dashes and hyphen runs are assembled at run time, because this
// file is itself inside the tree the scan reads.
const enDash = String.fromCodePoint(0x2013);
const emDash = String.fromCodePoint(0x2014);
const hyphenRun = "-".repeat(2);

describe("findProseViolations", () => {
  it("reports an en dash with its line number", () => {
    const violations = findProseViolations(`first line\nsecond ${enDash} line\n`);
    expect(violations).toEqual([{ lineNumber: 2, category: "en dash" }]);
  });

  it("reports an em dash", () => {
    const violations = findProseViolations(`a phrase ${emDash} another`);
    expect(violations).toEqual([{ lineNumber: 1, category: "em dash" }]);
  });

  it("reports a converter mangled hyphen run in prose", () => {
    const violations = findProseViolations(`a phrase ${hyphenRun} another`);
    expect(violations).toEqual([{ lineNumber: 1, category: "hyphen run" }]);
  });

  it("reports a triple hyphen run in prose", () => {
    const violations = findProseViolations(`a phrase ${"-".repeat(3)} another`);
    expect(violations).toEqual([{ lineNumber: 1, category: "hyphen run" }]);
  });

  it("exempts a Markdown table separator row", () => {
    expect(findProseViolations(`|${"-".repeat(3)}|${"-".repeat(3)}|`)).toEqual([]);
  });

  it("exempts a command line flag token", () => {
    expect(findProseViolations(`eslint . ${hyphenRun}max-warnings 0`)).toEqual([]);
    expect(findProseViolations(`"lint": "tsc ${hyphenRun}noEmit"`)).toEqual([]);
  });

  it("passes clean prose", () => {
    expect(findProseViolations("A sentence, with a colon: and a semicolon; done.")).toEqual([]);
  });
});
