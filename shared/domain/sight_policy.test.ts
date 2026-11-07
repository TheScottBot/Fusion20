import { describe, expect, it } from "vitest";
import { buildLightSource, buildSightScene, buildSightTarget, buildSightViewer } from "../testing/index.ts";
import type { SightBarrier } from "./line_of_sight.ts";
import {
  lightingEngineSightPolicy,
  rangeOnlySightPolicy,
  selectSightPolicy,
  targetSamplePoints,
} from "./sight_policy.ts";

const canSee = lightingEngineSightPolicy.canSee;
const daylight = buildSightScene({ daylightEnabled: true });
const wallBetween: SightBarrier = { kind: "wall", start: { x: 280, y: 70 }, end: { x: 280, y: 350 } };

describe("selectSightPolicy", () => {
  it("uses the lighting engine when the page's lighting is on, as FR5 says", () => {
    expect(selectSightPolicy(buildSightScene({ lightingEnabled: true }))).toBe(lightingEngineSightPolicy);
  });

  it("checks range only when the page's lighting is off", () => {
    expect(selectSightPolicy(buildSightScene({ lightingEnabled: false }))).toBe(rangeOnlySightPolicy);
  });
});

describe("rangeOnlySightPolicy", () => {
  it("passes even with no vision and a wall in the way", () => {
    const scene = buildSightScene({ lightingEnabled: false, barriers: [wallBetween] });
    expect(rangeOnlySightPolicy.canSee(buildSightViewer({ hasVision: false }), buildSightTarget(), scene)).toBe(true);
  });
});

describe("targetSamplePoints, under FD6", () => {
  it("gives the centre and four slightly inset corners", () => {
    const samples = targetSamplePoints(buildSightTarget({ centre: { x: 100, y: 100 }, width: 100, height: 100 }));
    expect(samples).toEqual([
      { x: 100, y: 100 },
      { x: 55, y: 55 },
      { x: 145, y: 55 },
      { x: 55, y: 145 },
      { x: 145, y: 145 },
    ]);
  });
});

describe("lightingEngineSightPolicy", () => {
  it("fails a viewer with no vision, even in daylight", () => {
    expect(canSee(buildSightViewer({ hasVision: false }), buildSightTarget(), daylight)).toBe(false);
  });

  it("fails with vision but no light at all", () => {
    expect(canSee(buildSightViewer(), buildSightTarget(), buildSightScene())).toBe(false);
  });

  it("passes in daylight with a clear line", () => {
    expect(canSee(buildSightViewer(), buildSightTarget(), daylight)).toBe(true);
  });

  it("fails in daylight behind a wall", () => {
    const scene = buildSightScene({ daylightEnabled: true, barriers: [wallBetween] });
    expect(canSee(buildSightViewer(), buildSightTarget(), scene)).toBe(false);
  });

  it("passes when a light reaches the target", () => {
    const scene = buildSightScene({ lights: [buildLightSource({ position: { x: 420, y: 150 }, reach: 100 })] });
    expect(canSee(buildSightViewer(), buildSightTarget(), scene)).toBe(true);
  });

  it("fails when the only light stops short of every sample point", () => {
    const scene = buildSightScene({ lights: [buildLightSource({ position: { x: 420, y: 100 }, reach: 40 })] });
    expect(canSee(buildSightViewer(), buildSightTarget(), scene)).toBe(false);
  });

  it("fails when a wall stands between the light and the target", () => {
    const shield: SightBarrier = { kind: "wall", start: { x: 300, y: 170 }, end: { x: 540, y: 170 } };
    const scene = buildSightScene({
      barriers: [shield],
      lights: [buildLightSource({ position: { x: 420, y: 120 }, reach: 300 })],
    });
    expect(canSee(buildSightViewer(), buildSightTarget(), scene)).toBe(false);
  });

  it("passes on night vision reaching the target with no light", () => {
    const viewer = buildSightViewer({ nightVisionReach: 300 });
    expect(canSee(viewer, buildSightTarget(), buildSightScene())).toBe(true);
  });

  it("fails on night vision stopping short of the target", () => {
    const viewer = buildSightViewer({ nightVisionReach: 100 });
    expect(canSee(viewer, buildSightTarget(), buildSightScene())).toBe(false);
  });

  it("fails on night vision when a wall is in the way", () => {
    const viewer = buildSightViewer({ nightVisionReach: 400 });
    expect(canSee(viewer, buildSightTarget(), buildSightScene({ barriers: [wallBetween] }))).toBe(false);
  });

  describe("fields of vision, with angles clockwise from up the page", () => {
    it("passes when the limited field faces the target, which is to the east", () => {
      const viewer = buildSightViewer({ fieldOfVision: { centreDegrees: 90, totalDegrees: 60 } });
      expect(canSee(viewer, buildSightTarget(), daylight)).toBe(true);
    });

    it("fails when the limited field faces away", () => {
      const viewer = buildSightViewer({ fieldOfVision: { centreDegrees: 270, totalDegrees: 60 } });
      expect(canSee(viewer, buildSightTarget(), daylight)).toBe(false);
    });

    it("handles a field crossing north", () => {
      const viewer = buildSightViewer({
        position: { x: 420, y: 500 },
        fieldOfVision: { centreDegrees: 350, totalDegrees: 60 },
      });
      expect(canSee(viewer, buildSightTarget(), daylight)).toBe(true);
    });

    it("measures the total as the whole width of the field, half on each side of its centre", () => {
      const viewer = buildSightViewer({ fieldOfVision: { centreDegrees: 30, totalDegrees: 100 } });
      expect(canSee(viewer, buildSightTarget(), daylight)).toBe(false);
    });

    it("limits night vision by its own field, separately from sight", () => {
      const viewer = buildSightViewer({
        nightVisionReach: 400,
        nightFieldOfVision: { centreDegrees: 270, totalDegrees: 60 },
      });
      expect(canSee(viewer, buildSightTarget(), buildSightScene())).toBe(false);
    });
  });

  describe("directional light", () => {
    const source = { position: { x: 420, y: 110 }, reach: 400 };

    it("lights a target inside its beam", () => {
      const light = buildLightSource({ ...source, beam: { centreDegrees: 180, totalDegrees: 60 } });
      expect(canSee(buildSightViewer(), buildSightTarget(), buildSightScene({ lights: [light] }))).toBe(true);
    });

    it("does not light a target outside its beam", () => {
      const light = buildLightSource({ ...source, beam: { centreDegrees: 0, totalDegrees: 60 } });
      expect(canSee(buildSightViewer(), buildSightTarget(), buildSightScene({ lights: [light] }))).toBe(false);
    });
  });

  describe("partial daylight, observed in Roll20 on 7 November 2026", () => {
    it.each([
      [1, true],
      [0.9, true],
      [0.5, false],
      [0.05, false],
    ])("at opacity %s gives %s", (daylightOpacity, expected) => {
      const scene = buildSightScene({ daylightEnabled: true, daylightOpacity });
      expect(canSee(buildSightViewer(), buildSightTarget(), scene)).toBe(expected);
    });

    it("still lets a lamp light the target in weak daylight", () => {
      const scene = buildSightScene({
        daylightEnabled: true,
        daylightOpacity: 0.5,
        lights: [buildLightSource({ position: { x: 420, y: 150 }, reach: 100 })],
      });
      expect(canSee(buildSightViewer(), buildSightTarget(), scene)).toBe(true);
    });
  });

  it("sees the target in the observed sensitivity rooms, lit by a lamp two squares away", () => {
    const scene = buildSightScene({ lights: [buildLightSource({ position: { x: 770, y: 1260 }, reach: 175 })] });
    const viewer = buildSightViewer({ position: { x: 630, y: 1260 } });
    expect(canSee(viewer, buildSightTarget({ centre: { x: 910, y: 1260 } }), scene)).toBe(true);
  });

  describe("the rooms observed from a player's view in Roll20 on 7 November 2026", () => {
    const roomCentreLine = { start: { x: 280, y: 70 }, end: { x: 280, y: 350 } };
    const observedDividers: readonly (readonly [string, SightBarrier, boolean])[] = [
      ["Control wall", { kind: "wall", ...roomCentreLine }, false],
      ["Transparent", { kind: "transparent", ...roomCentreLine }, true],
      ["One way", { kind: "one way", isReversed: false, ...roomCentreLine }, true],
      ["One way reversed", { kind: "one way", isReversed: true, ...roomCentreLine }, false],
      ["Door closed", { kind: "door", isOpen: false, ...roomCentreLine }, false],
      ["Door open", { kind: "door", isOpen: true, ...roomCentreLine }, true],
      ["Window", { kind: "window", ...roomCentreLine }, true],
    ];

    it.each(observedDividers)("matches room %s in daylight", (_roomName, divider, expected) => {
      const scene = buildSightScene({ daylightEnabled: true, barriers: [divider] });
      expect(canSee(buildSightViewer(), buildSightTarget(), scene)).toBe(expected);
    });

    it("sees the sliver of Corner small, so a part of a target counts", () => {
      const scene = buildSightScene({
        daylightEnabled: true,
        barriers: [{ kind: "wall", start: { x: 1350, y: 770 }, end: { x: 1350, y: 935 } }],
      });
      const viewer = buildSightViewer({ position: { x: 1120, y: 910 } });
      expect(canSee(viewer, buildSightTarget({ centre: { x: 1400, y: 910 } }), scene)).toBe(true);
    });

    it("does not see Corner large, where no part of the target was exposed", () => {
      const scene = buildSightScene({
        daylightEnabled: true,
        barriers: [{ kind: "wall", start: { x: 250, y: 1120 }, end: { x: 250, y: 1355 } }],
      });
      const viewer = buildSightViewer({ position: { x: 140, y: 1260 } });
      const target = buildSightTarget({ centre: { x: 370, y: 1260 }, width: 210, height: 210 });
      expect(canSee(viewer, target, scene)).toBe(false);
    });
  });
});
