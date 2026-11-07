import type { LightSource, SightScene, SightTarget, SightViewer } from "../domain/sight_policy.ts";

export function buildSightViewer(fixture: Partial<SightViewer> = {}): SightViewer {
  return {
    position: { x: 140, y: 210 },
    hasVision: true,
    nightVisionReach: 0,
    fieldOfVision: undefined,
    nightFieldOfVision: undefined,
    lightSensitivityPercent: 100,
    ...fixture,
  };
}

export function buildSightTarget(fixture: Partial<SightTarget> = {}): SightTarget {
  return { centre: { x: 420, y: 210 }, width: 70, height: 70, ...fixture };
}

export function buildLightSource(fixture: Partial<LightSource> = {}): LightSource {
  return { position: { x: 420, y: 210 }, reach: 100, beam: undefined, ...fixture };
}

export function buildSightScene(fixture: Partial<SightScene> = {}): SightScene {
  return { lightingEnabled: true, daylightEnabled: false, barriers: [], lights: [], ...fixture };
}
