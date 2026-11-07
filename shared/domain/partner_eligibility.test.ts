import { describe, expect, it } from "vitest";
import { buildFusionCandidate, buildFusionTarget, buildSightScene, buildSightViewer } from "../testing/index.ts";
import { createSquareGrid, type SquareGrid } from "./grid_geometry.ts";
import { assessFusionPartners, hasEligiblePartner } from "./partner_eligibility.ts";

function fiveFootGrid(): SquareGrid {
  const creation = createSquareGrid({
    gridType: "square",
    diagonalRule: "foure",
    scaleNumber: 5,
    snappingIncrement: 1,
  });
  if (creation.outcome === "refused") {
    throw new Error("Expected the grid to be created");
  }
  return creation.grid;
}

const lightingOff = buildSightScene({ lightingEnabled: false });
const baseAssessment = {
  participants: ["original roller"],
  target: buildFusionTarget(),
  grid: fiveFootGrid(),
  scene: lightingOff,
};

function footprintAtColumn(column: number) {
  return { firstColumn: column, lastColumn: column, firstRow: 0, lastRow: 0 };
}

function assessOne(candidate = buildFusionCandidate(), overrides = {}) {
  const [assessment] = assessFusionPartners({ ...baseAssessment, candidates: [candidate], ...overrides });
  if (assessment === undefined) {
    throw new Error("Expected one assessment");
  }
  return assessment;
}

describe("assessFusionPartners", () => {
  it("passes an adjacent ally with reach, and reports the distance", () => {
    expect(assessOne()).toEqual({ reference: "fixture candidate", isEligible: true, reasons: [], distance: 5 });
  });

  it("refuses a non ally", () => {
    expect(assessOne(buildFusionCandidate({ isAlly: false }))).toMatchObject({
      isEligible: false,
      reasons: ["not an ally"],
    });
  });

  it("refuses someone already in the chain", () => {
    const candidate = buildFusionCandidate({ reference: "original roller" });
    expect(assessOne(candidate).reasons).toEqual(["already a participant"]);
  });

  it("refuses a combatant out of range", () => {
    expect(assessOne(buildFusionCandidate({ footprint: footprintAtColumn(4) })).reasons).toEqual(["out of range"]);
  });

  it("refuses a combatant with no range profile, under FD5", () => {
    expect(assessOne(buildFusionCandidate({ rangeProfile: { status: "missing" } })).reasons).toEqual([
      "no range profile",
    ]);
  });

  it("refuses a combatant whose profile will not parse, separately from having none", () => {
    const candidate = buildFusionCandidate({ rangeProfile: { status: "malformed" } });
    expect(assessOne(candidate).reasons).toEqual(["malformed range profile"]);
  });

  it("does not also call an unknown range out of range", () => {
    const candidate = buildFusionCandidate({ rangeProfile: { status: "missing" }, footprint: footprintAtColumn(9) });
    expect(assessOne(candidate).reasons).not.toContain("out of range");
  });

  it("refuses a combatant who cannot see the target when lighting is on", () => {
    const scene = buildSightScene({ lightingEnabled: true });
    expect(assessOne(buildFusionCandidate(), { scene }).reasons).toEqual(["cannot see target"]);
  });

  it("does not check sight when lighting is off, as FR5 says", () => {
    const candidate = buildFusionCandidate({ viewer: buildSightViewer({ hasVision: false }) });
    expect(assessOne(candidate).isEligible).toBe(true);
  });

  it("refuses the target itself, which cannot make an attack against itself", () => {
    expect(assessOne(buildFusionCandidate({ reference: "fixture target" })).reasons).toEqual(["is the target"]);
  });

  it("reports every reason at once, so the fix is clear the first time", () => {
    const candidate = buildFusionCandidate({
      reference: "original roller",
      isAlly: false,
      footprint: footprintAtColumn(9),
    });
    expect(assessOne(candidate, { scene: buildSightScene({ lightingEnabled: true }) }).reasons).toEqual([
      "not an ally",
      "already a participant",
      "out of range",
      "cannot see target",
    ]);
  });

  it("orders eligible candidates first, then by distance", () => {
    const candidates = [
      buildFusionCandidate({ reference: "far and out of reach", footprint: footprintAtColumn(9) }),
      buildFusionCandidate({ reference: "near and not an ally", isAlly: false }),
      buildFusionCandidate({
        reference: "far with a bow",
        footprint: footprintAtColumn(6),
        rangeProfile: { status: "present", profile: { meleeReach: 5, rangedLongRange: 150, cantripRange: undefined } },
      }),
      buildFusionCandidate({ reference: "adjacent" }),
    ];
    const references = assessFusionPartners({ ...baseAssessment, candidates }).map((assessed) => assessed.reference);
    expect(references).toEqual(["adjacent", "far with a bow", "near and not an ally", "far and out of reach"]);
  });

  it("orders candidates at one distance by reference, so the list does not shuffle between prompts", () => {
    const candidates = [buildFusionCandidate({ reference: "bravo" }), buildFusionCandidate({ reference: "alpha" })];
    const references = assessFusionPartners({ ...baseAssessment, candidates }).map((assessed) => assessed.reference);
    expect(references).toEqual(["alpha", "bravo"]);
  });

  it("re-evaluates against the current battlefield, so a moved token changes the answer", () => {
    const candidate = buildFusionCandidate();
    expect(assessOne(candidate).isEligible).toBe(true);
    expect(assessOne({ ...candidate, footprint: footprintAtColumn(5) }).isEligible).toBe(false);
  });

  it("does not change the list it was given", () => {
    const candidates = Object.freeze([
      buildFusionCandidate({ reference: "bravo" }),
      buildFusionCandidate({ reference: "alpha" }),
    ]);
    expect(() => assessFusionPartners({ ...baseAssessment, candidates })).not.toThrow();
  });
});

describe("assessFusionPartners on an adjacent diagonal, under FF56", () => {
  const diagonalFootprint = { firstColumn: 1, lastColumn: 1, firstRow: 1, lastRow: 1 };

  it.each(["pythagorean", "manhattan", "threefive", "foure"])("reaches in melee under %s", (diagonalRule) => {
    const creation = createSquareGrid({ gridType: "square", diagonalRule, scaleNumber: 5, snappingIncrement: 1 });
    if (creation.outcome === "refused") {
      throw new Error("Expected the grid to be created");
    }
    const candidate = buildFusionCandidate({ footprint: diagonalFootprint });
    expect(assessOne(candidate, { grid: creation.grid }).isEligible).toBe(true);
  });
});

describe("hasEligiblePartner", () => {
  it("is true when anyone qualifies", () => {
    const assessments = assessFusionPartners({ ...baseAssessment, candidates: [buildFusionCandidate()] });
    expect(hasEligiblePartner(assessments)).toBe(true);
  });

  it("is false when nobody does, which ends the chain under FR8", () => {
    const candidates = [buildFusionCandidate({ isAlly: false })];
    expect(hasEligiblePartner(assessFusionPartners({ ...baseAssessment, candidates }))).toBe(false);
    expect(hasEligiblePartner([])).toBe(false);
  });
});
