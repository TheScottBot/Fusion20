import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildAttackRoll } from "../testing/index.ts";
import { createAttackRoll, qualifiesForFusionCritical, selectKeptNaturalD20 } from "./attack_roll.ts";

describe("qualifiesForFusionCritical", () => {
  it.each([
    { keptNaturalD20: 18, criticalThreshold: 19, expected: false },
    { keptNaturalD20: 19, criticalThreshold: 19, expected: true },
    { keptNaturalD20: 20, criticalThreshold: 19, expected: true },
    { keptNaturalD20: 18, criticalThreshold: 20, expected: false },
    { keptNaturalD20: 19, criticalThreshold: 20, expected: false },
    { keptNaturalD20: 20, criticalThreshold: 20, expected: true },
  ])(
    "is $expected for a kept $keptNaturalD20 against threshold $criticalThreshold",
    ({ keptNaturalD20, criticalThreshold, expected }) => {
      const attackRoll = buildAttackRoll({ keptNaturalD20, criticalThreshold });
      expect(qualifiesForFusionCritical(attackRoll)).toBe(expected);
    },
  );
});

describe("selectKeptNaturalD20", () => {
  it("ignores the dropped high die under disadvantage", () => {
    expect(selectKeptNaturalD20([20, 4], "disadvantage")).toBe(4);
  });

  it("ignores the dropped low die under advantage", () => {
    expect(selectKeptNaturalD20([3, 20], "advantage")).toBe(20);
  });

  it("keeps the highest of three dice under super advantage", () => {
    expect(selectKeptNaturalD20([2, 19, 7], "advantage")).toBe(19);
  });

  it("keeps the only die on a normal roll", () => {
    expect(selectKeptNaturalD20([11], "normal")).toBe(11);
  });

  it("names no kept die when a normal roll has two dice, since neither was chosen", () => {
    expect(selectKeptNaturalD20([11, 12], "normal")).toBeUndefined();
  });

  it("means a dropped natural 20 under disadvantage does not qualify", () => {
    const keptNaturalD20 = selectKeptNaturalD20([20, 4], "disadvantage");
    expect(keptNaturalD20).toBe(4);
    const attackRoll = buildAttackRoll({ keptNaturalD20: keptNaturalD20 ?? 0 });
    expect(qualifiesForFusionCritical(attackRoll)).toBe(false);
  });
});

describe("createAttackRoll", () => {
  const validFields = { rollerReference: "roller", keptNaturalD20: 12, criticalThreshold: 20 };

  it("creates a roll from valid fields", () => {
    expect(createAttackRoll(validFields)).toEqual({ outcome: "created", attackRoll: validFields });
  });

  it.each([0, 21, 1.5, Number.NaN])("refuses a natural die of %s", (keptNaturalD20) => {
    expect(createAttackRoll({ ...validFields, keptNaturalD20 })).toEqual({
      outcome: "refused",
      reason: "natural die out of range",
      refusedValue: keptNaturalD20,
    });
  });

  it.each([1, 0, 21, 18.5])("refuses a critical threshold of %s", (criticalThreshold) => {
    expect(createAttackRoll({ ...validFields, criticalThreshold })).toEqual({
      outcome: "refused",
      reason: "critical threshold out of range",
      refusedValue: criticalThreshold,
    });
  });

  it("refuses a threshold of 1, so a forced critical can never qualify a low die", () => {
    const creation = createAttackRoll({ ...validFields, keptNaturalD20: 2, criticalThreshold: 1 });
    expect(creation.outcome).toBe("refused");
  });

  it("agrees with the die table for every valid die and threshold", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 2, max: 20 }), (keptNaturalD20, threshold) => {
        const attackRoll = buildAttackRoll({ keptNaturalD20, criticalThreshold: threshold });
        expect(qualifiesForFusionCritical(attackRoll)).toBe(keptNaturalD20 >= threshold);
      }),
    );
  });
});
