import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDigitalInlineRoll, buildMinimumTenInlineRoll, buildRolledInlineRoll } from "../testing/index.ts";
import { interpretInlineRoll } from "./inline_roll_interpretation.ts";

describe("interpretInlineRoll, Beyond20's digital dice", () => {
  it.each([
    [20, "critical"],
    [19, "critical"],
    [3, "none"],
    [1, "fumble"],
  ] as const)("reads a natural %s with marker %s", (naturalD20, marker) => {
    expect(interpretInlineRoll(buildDigitalInlineRoll(naturalD20, marker))).toEqual({
      outcome: "digital",
      naturalD20,
      marker,
    });
  });

  it("refuses a digital roll whose formula is not a d20", () => {
    const damageRoll = buildDigitalInlineRoll(7) as { results: { rolls: { text?: string }[] } };
    const label = damageRoll.results.rolls.find((roll) => roll.text?.startsWith("1d20"));
    if (label !== undefined) {
      label.text = "1d12 + 3";
    }
    expect(interpretInlineRoll(damageRoll)).toEqual({ outcome: "unreadable", reason: "no d20" });
  });

  it("refuses a digital comment it does not recognise", () => {
    const changed = buildDigitalInlineRoll(7) as { results: { rolls: { type: string; text?: string }[] } };
    const comment = changed.results.rolls.find((roll) => roll.type === "C");
    if (comment !== undefined) {
      comment.text = "= (seven) + 7";
    }
    expect(interpretInlineRoll(changed)).toEqual({ outcome: "unreadable", reason: "unrecognised digital roll" });
  });
});

describe("interpretInlineRoll, Roll20's own dice", () => {
  it("reads a plain d20 with no threshold", () => {
    expect(interpretInlineRoll(buildRolledInlineRoll([{ value: 15 }]))).toEqual({
      outcome: "rolled",
      naturalD20s: [15],
      criticalPoint: undefined,
    });
  });

  it("reads a Champion's threshold", () => {
    expect(interpretInlineRoll(buildRolledInlineRoll([{ value: 18 }], 19))).toMatchObject({ criticalPoint: 19 });
  });

  it("reads a forced critical's threshold of 1 as it is, for the caller to apply FD17", () => {
    expect(interpretInlineRoll(buildRolledInlineRoll([{ value: 7 }], 1))).toMatchObject({ criticalPoint: 1 });
  });

  it("leaves out a dropped die, wherever it sits", () => {
    const firstDropped = buildRolledInlineRoll([{ value: 9, isDropped: true }, { value: 16 }]);
    const lastDropped = buildRolledInlineRoll([{ value: 18 }, { value: 8, isDropped: true }]);
    expect(interpretInlineRoll(firstDropped)).toMatchObject({ naturalD20s: [16] });
    expect(interpretInlineRoll(lastDropped)).toMatchObject({ naturalD20s: [18] });
  });

  it("keeps the rerolled die and not the 1 a halfling rerolled", () => {
    const reroll = buildRolledInlineRoll([{ value: 1, isDropped: true }, { value: 15 }]);
    expect(interpretInlineRoll(reroll)).toMatchObject({ naturalD20s: [15] });
  });

  it("finds the natural die inside a minimum ten group, not the group's total", () => {
    expect(interpretInlineRoll(buildMinimumTenInlineRoll(7))).toMatchObject({ naturalD20s: [7] });
  });

  it("refuses a roll with no d20, such as a typed constant, so FD19's real die test holds", () => {
    const constant = { expression: "20", results: { type: "V", rolls: [{ type: "M", expr: "20" }], total: 20 } };
    expect(interpretInlineRoll(constant)).toEqual({ outcome: "unreadable", reason: "no d20" });
  });

  it("refuses a die value outside 1 to 20", () => {
    expect(interpretInlineRoll(buildRolledInlineRoll([{ value: 21 }]))).toEqual({
      outcome: "unreadable",
      reason: "die out of range",
    });
  });
});

describe("interpretInlineRoll on hostile input", () => {
  it.each([null, undefined, 7, "text", [], { results: "no" }, { results: { rolls: "no" } }])(
    "refuses %j as not an inline roll",
    (hostileInput) => {
      expect(interpretInlineRoll(hostileInput)).toEqual({ outcome: "unreadable", reason: "not an inline roll" });
    },
  );

  it("refuses an inline roll larger than its bound before reading it", () => {
    const huge = buildRolledInlineRoll(Array.from({ length: 2000 }, () => ({ value: 5 })));
    expect(interpretInlineRoll(huge)).toEqual({ outcome: "unreadable", reason: "inline roll too large" });
  });

  it("refuses a cyclic object rather than looping", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.results = cyclic;
    expect(interpretInlineRoll(cyclic).outcome).toBe("unreadable");
  });

  it("never throws on arbitrary values, which is the fuzz harness for this interpreter", () => {
    fc.assert(
      fc.property(fc.anything(), (hostileInput) => {
        const reading = interpretInlineRoll(hostileInput);
        expect(["digital", "rolled", "unreadable"]).toContain(reading.outcome);
      }),
      { numRuns: 20_000 },
    );
  });
});
