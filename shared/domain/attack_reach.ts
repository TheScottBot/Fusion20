export interface AttackRangeProfile {
  readonly meleeReach: number | undefined;
  readonly rangedLongRange: number | undefined;
  readonly cantripRange: number | undefined;
}

// At or within, because FR4 counts a ranged weapon up to its long range.
export function anyAttackReaches(profile: AttackRangeProfile, distance: number): boolean {
  const ranges = [profile.meleeReach, profile.rangedLongRange, profile.cantripRange];
  return ranges.some((range) => range !== undefined && distance <= range);
}
