import type { CombatantReference } from "./attack_roll.ts";
import { attackReachesTarget, type AttackRangeProfile } from "./attack_reach.ts";
import {
  areFootprintsAdjacent,
  measureFootprintDistance,
  type SquareGrid,
  type TokenFootprint,
} from "./grid_geometry.ts";
import { selectSightPolicy, type SightScene, type SightTarget, type SightViewer } from "./sight_policy.ts";

export type RangeProfileReading =
  | { readonly status: "present"; readonly profile: AttackRangeProfile }
  | { readonly status: "missing" }
  | { readonly status: "malformed" };

export interface FusionCandidate {
  readonly reference: CombatantReference;
  readonly isAlly: boolean;
  readonly footprint: TokenFootprint;
  readonly rangeProfile: RangeProfileReading;
  readonly viewer: SightViewer;
}

export interface FusionTarget {
  readonly reference: CombatantReference;
  readonly footprint: TokenFootprint;
  readonly sightTarget: SightTarget;
}

export type IneligibilityReason =
  | "not an ally"
  | "already a participant"
  | "is the target"
  | "no range profile"
  | "malformed range profile"
  | "out of range"
  | "cannot see target";

export interface PartnerAssessment {
  readonly reference: CombatantReference;
  readonly isEligible: boolean;
  readonly reasons: readonly IneligibilityReason[];
  readonly distance: number;
}

export interface FusionPartnerQuestion {
  readonly candidates: readonly FusionCandidate[];
  readonly participants: readonly CombatantReference[];
  readonly target: FusionTarget;
  readonly grid: SquareGrid;
  readonly scene: SightScene;
}

function findRangeReason(
  rangeProfile: RangeProfileReading,
  distance: number,
  isAdjacent: boolean,
): IneligibilityReason | undefined {
  if (rangeProfile.status === "missing") {
    return "no range profile";
  }
  if (rangeProfile.status === "malformed") {
    return "malformed range profile";
  }
  return attackReachesTarget(rangeProfile.profile, distance, isAdjacent) ? undefined : "out of range";
}

function assessCandidate(candidate: FusionCandidate, question: FusionPartnerQuestion): PartnerAssessment {
  const { participants, target, grid, scene } = question;
  const distance = measureFootprintDistance(candidate.footprint, target.footprint, grid);
  const isAdjacent = areFootprintsAdjacent(candidate.footprint, target.footprint);
  const rangeReason = findRangeReason(candidate.rangeProfile, distance, isAdjacent);
  const canSeeTarget = selectSightPolicy(scene).canSee(candidate.viewer, target.sightTarget, scene);
  // Every reason is gathered, rather than stopping at the first, so one prompt shows the whole fix.
  const reasons: IneligibilityReason[] = [
    ...(candidate.isAlly ? [] : (["not an ally"] as const)),
    ...(participants.includes(candidate.reference) ? (["already a participant"] as const) : []),
    ...(candidate.reference === target.reference ? (["is the target"] as const) : []),
    ...(rangeReason === undefined ? [] : [rangeReason]),
    ...(canSeeTarget ? [] : (["cannot see target"] as const)),
  ];
  return { reference: candidate.reference, isEligible: reasons.length === 0, reasons, distance };
}

function compareAssessments(first: PartnerAssessment, second: PartnerAssessment): number {
  if (first.isEligible !== second.isEligible) {
    return first.isEligible ? -1 : 1;
  }
  if (first.distance !== second.distance) {
    return first.distance - second.distance;
  }
  // Plain comparison, as a locale aware one could order the list differently per browser.
  if (first.reference === second.reference) {
    return 0;
  }
  return first.reference < second.reference ? -1 : 1;
}

export function assessFusionPartners(question: FusionPartnerQuestion): readonly PartnerAssessment[] {
  return question.candidates.map((candidate) => assessCandidate(candidate, question)).sort(compareAssessments);
}

export function hasEligiblePartner(assessments: readonly PartnerAssessment[]): boolean {
  return assessments.some((assessment) => assessment.isEligible);
}
