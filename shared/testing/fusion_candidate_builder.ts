import type { FusionCandidate, FusionTarget } from "../domain/partner_eligibility.ts";
import { buildSightTarget, buildSightViewer } from "./sight_scene_builder.ts";

const adjacentFootprint = { firstColumn: 1, lastColumn: 1, firstRow: 0, lastRow: 0 };

export function buildFusionCandidate(fixture: Partial<FusionCandidate> = {}): FusionCandidate {
  return {
    reference: "fixture candidate",
    isAlly: true,
    footprint: adjacentFootprint,
    rangeProfile: {
      status: "present",
      profile: { meleeReach: 5, rangedLongRange: undefined, cantripRange: undefined },
    },
    viewer: buildSightViewer(),
    ...fixture,
  };
}

export function buildFusionTarget(fixture: Partial<FusionTarget> = {}): FusionTarget {
  return {
    reference: "fixture target",
    footprint: { firstColumn: 0, lastColumn: 0, firstRow: 0, lastRow: 0 },
    sightTarget: buildSightTarget(),
    ...fixture,
  };
}
