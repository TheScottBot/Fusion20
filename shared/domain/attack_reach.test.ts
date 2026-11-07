import { describe, expect, it } from "vitest";
import { anyAttackReaches, attackReachesTarget, type AttackRangeProfile } from "./attack_reach.ts";

const noAttacks: AttackRangeProfile = { meleeReach: undefined, rangedLongRange: undefined, cantripRange: undefined };

describe("anyAttackReaches", () => {
  it.each([
    ["melee reach", { ...noAttacks, meleeReach: 5 }],
    ["a ranged weapon's long range", { ...noAttacks, rangedLongRange: 5 }],
    ["an attack cantrip's range", { ...noAttacks, cantripRange: 5 }],
  ])("counts %s", (_attackName, profile) => {
    expect(anyAttackReaches(profile, 5)).toBe(true);
    expect(anyAttackReaches(profile, 10)).toBe(false);
  });

  it("uses the furthest attack the combatant has", () => {
    expect(anyAttackReaches({ meleeReach: 5, rangedLongRange: 600, cantripRange: 120 }, 500)).toBe(true);
  });

  it("includes the exact limit, since long range counts as in range", () => {
    expect(anyAttackReaches({ ...noAttacks, rangedLongRange: 150 }, 150)).toBe(true);
  });

  it("reaches nothing with no attacks", () => {
    expect(anyAttackReaches(noAttacks, 0)).toBe(false);
  });
});

describe("attackReachesTarget", () => {
  it("lets a melee attack reach anything adjacent, whatever the distance measures", () => {
    expect(attackReachesTarget({ ...noAttacks, meleeReach: 5 }, 10, true)).toBe(true);
  });

  it("gives that to melee only, so a bow does not gain it", () => {
    expect(attackReachesTarget({ ...noAttacks, rangedLongRange: 5 }, 10, true)).toBe(false);
    expect(attackReachesTarget({ ...noAttacks, cantripRange: 5 }, 10, true)).toBe(false);
  });

  it("does not help a melee attack against something not adjacent", () => {
    expect(attackReachesTarget({ ...noAttacks, meleeReach: 5 }, 10, false)).toBe(false);
  });

  it("still measures normally for everything else", () => {
    expect(attackReachesTarget({ ...noAttacks, rangedLongRange: 150 }, 100, false)).toBe(true);
  });
});
