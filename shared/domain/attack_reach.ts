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

// The author's ruling on FF56: adjacent counts for melee on every diagonal rule, as any player
// would expect, even where the page's measurement says more than the weapon's reach.
export function attackReachesTarget(profile: AttackRangeProfile, distance: number, isAdjacent: boolean): boolean {
  return anyAttackReaches(profile, distance) || (isAdjacent && profile.meleeReach !== undefined);
}

export function meleeReachesBySquares(profile: AttackRangeProfile, squaresDistance: number): boolean {
  return profile.meleeReach !== undefined && squaresDistance <= profile.meleeReach;
}
