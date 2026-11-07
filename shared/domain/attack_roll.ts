export type CombatantReference = string;

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface AttackRoll {
  readonly rollerReference: CombatantReference;
  readonly keptNaturalD20: number;
  readonly criticalThreshold: number;
}

export type AttackRollCreation =
  | { readonly outcome: "created"; readonly attackRoll: AttackRoll }
  | {
      readonly outcome: "refused";
      readonly reason: "natural die out of range" | "critical threshold out of range";
      readonly refusedValue: number;
    };

const lowestNaturalD20 = 1;
const highestNaturalD20 = 20;
// A threshold of 1 is how Beyond20 writes a forced critical. FR1 says those never qualify and
// FD17 has the interpreter read them as 20, so refusing it here means an interpreter fault
// cannot turn every roll into a critical.
const lowestCriticalThreshold = 2;

function isWholeNumberBetween(candidate: number, lowest: number, highest: number): boolean {
  return Number.isInteger(candidate) && candidate >= lowest && candidate <= highest;
}

export function createAttackRoll(fields: AttackRoll): AttackRollCreation {
  if (!isWholeNumberBetween(fields.keptNaturalD20, lowestNaturalD20, highestNaturalD20)) {
    return { outcome: "refused", reason: "natural die out of range", refusedValue: fields.keptNaturalD20 };
  }
  if (!isWholeNumberBetween(fields.criticalThreshold, lowestCriticalThreshold, highestNaturalD20)) {
    return { outcome: "refused", reason: "critical threshold out of range", refusedValue: fields.criticalThreshold };
  }
  return { outcome: "created", attackRoll: fields };
}

// FR1 counts only the kept die, and which die is kept is part of that rule, so it is decided
// here rather than in whichever interpreter read the dice.
export function selectKeptNaturalD20(
  naturalDice: readonly [number, ...number[]],
  rollMode: RollMode,
): number | undefined {
  if (rollMode === "advantage") {
    return Math.max(...naturalDice);
  }
  if (rollMode === "disadvantage") {
    return Math.min(...naturalDice);
  }
  // Two dice with neither advantage nor disadvantage is Beyond20's roll twice, where the player
  // has not chosen, so there is no kept die to name yet.
  return naturalDice.length === 1 ? naturalDice[0] : undefined;
}

export function qualifiesForFusionCritical(attackRoll: AttackRoll): boolean {
  return attackRoll.keptNaturalD20 >= attackRoll.criticalThreshold;
}
