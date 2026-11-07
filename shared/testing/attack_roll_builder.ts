import { createAttackRoll, type AttackRoll } from "../domain/attack_roll.ts";

export interface AttackRollFixture {
  readonly rollerReference?: string;
  readonly keptNaturalD20?: number;
  readonly criticalThreshold?: number;
}

// Fixture builders exist once, here, so a test states only the field it cares about.
export function buildAttackRoll(fixture: AttackRollFixture = {}): AttackRoll {
  const creation = createAttackRoll({
    rollerReference: fixture.rollerReference ?? "fixture roller",
    keptNaturalD20: fixture.keptNaturalD20 ?? 10,
    criticalThreshold: fixture.criticalThreshold ?? 20,
  });
  if (creation.outcome === "refused") {
    throw new Error(`Invalid attack roll fixture: ${creation.reason}`);
  }
  return creation.attackRoll;
}

export function buildQualifyingRoll(rollerReference: string): AttackRoll {
  return buildAttackRoll({ rollerReference, keptNaturalD20: 20 });
}

export function buildFailingRoll(rollerReference: string): AttackRoll {
  return buildAttackRoll({ rollerReference, keptNaturalD20: 5 });
}
