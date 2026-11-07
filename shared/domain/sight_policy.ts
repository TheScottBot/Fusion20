import { hasLineOfSight, type PagePoint, type SightBarrier } from "./line_of_sight.ts";

// Angles are degrees clockwise from up the page. Roll20's own convention for field of vision
// centres was not observed, so converting to this one is the interpreter's job (FF53).
export interface AngularField {
  readonly centreDegrees: number;
  readonly totalDegrees: number;
}

export interface SightViewer {
  readonly position: PagePoint;
  readonly hasVision: boolean;
  readonly nightVisionReach: number;
  readonly fieldOfVision: AngularField | undefined;
  readonly nightFieldOfVision: AngularField | undefined;
  readonly lightSensitivityPercent: number;
}

export interface SightTarget {
  readonly centre: PagePoint;
  readonly width: number;
  readonly height: number;
}

// One reach, because FD7 counts bright and dim alike, so only the furthest extent matters.
export interface LightSource {
  readonly position: PagePoint;
  readonly reach: number;
  readonly beam: AngularField | undefined;
}

export interface SightScene {
  readonly lightingEnabled: boolean;
  readonly daylightEnabled: boolean;
  readonly barriers: readonly SightBarrier[];
  readonly lights: readonly LightSource[];
}

export interface SightPolicy {
  readonly canSee: (viewer: SightViewer, target: SightTarget, scene: SightScene) => boolean;
}

// Slight, because a token's art rarely fills its square corner to corner, and small enough that
// the sliver of a target in Roll20's Corner small room still counted.
const cornerInsetRatio = 0.05;
const fullCircleDegrees = 360;
const fullLightSensitivityPercent = 100;

export function targetSamplePoints(target: SightTarget): readonly PagePoint[] {
  const { centre, width, height } = target;
  const acrossFromCentre = (width / 2) * (1 - 2 * cornerInsetRatio);
  const downFromCentre = (height / 2) * (1 - 2 * cornerInsetRatio);
  return [
    centre,
    { x: centre.x - acrossFromCentre, y: centre.y - downFromCentre },
    { x: centre.x + acrossFromCentre, y: centre.y - downFromCentre },
    { x: centre.x - acrossFromCentre, y: centre.y + downFromCentre },
    { x: centre.x + acrossFromCentre, y: centre.y + downFromCentre },
  ];
}

function distanceBetween(firstPoint: PagePoint, secondPoint: PagePoint): number {
  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
}

function bearingDegrees(origin: PagePoint, point: PagePoint): number {
  const radians = Math.atan2(point.x - origin.x, origin.y - point.y);
  return (radians * 180) / Math.PI;
}

function isWithinField(origin: PagePoint, point: PagePoint, field: AngularField | undefined): boolean {
  if (field === undefined || field.totalDegrees >= fullCircleDegrees) {
    return true;
  }
  const degreesOffCentre = Math.abs(bearingDegrees(origin, point) - field.centreDegrees) % fullCircleDegrees;
  const shortestOffset = Math.min(degreesOffCentre, fullCircleDegrees - degreesOffCentre);
  return shortestOffset <= field.totalDegrees / 2;
}

function isLitByNightVision(viewer: SightViewer, point: PagePoint): boolean {
  return (
    distanceBetween(viewer.position, point) <= viewer.nightVisionReach &&
    isWithinField(viewer.position, point, viewer.nightFieldOfVision)
  );
}

function isLitBySource(light: LightSource, viewer: SightViewer, point: PagePoint, scene: SightScene): boolean {
  const reachForViewer = (light.reach * viewer.lightSensitivityPercent) / fullLightSensitivityPercent;
  return (
    distanceBetween(light.position, point) <= reachForViewer &&
    isWithinField(light.position, point, light.beam) &&
    hasLineOfSight(light.position, point, scene.barriers)
  );
}

function isIlluminated(viewer: SightViewer, point: PagePoint, scene: SightScene): boolean {
  return (
    scene.daylightEnabled ||
    isLitByNightVision(viewer, point) ||
    scene.lights.some((light) => isLitBySource(light, viewer, point, scene))
  );
}

export const rangeOnlySightPolicy: SightPolicy = { canSee: () => true };

export const lightingEngineSightPolicy: SightPolicy = {
  canSee: (viewer, target, scene) => {
    if (!viewer.hasVision) {
      return false;
    }
    // FD6: one point both in view and lit is enough, as seeing any part of a creature is seeing it.
    return targetSamplePoints(target).some((samplePoint) => {
      return (
        isWithinField(viewer.position, samplePoint, viewer.fieldOfVision) &&
        hasLineOfSight(viewer.position, samplePoint, scene.barriers) &&
        isIlluminated(viewer, samplePoint, scene)
      );
    });
  },
};

export function selectSightPolicy(scene: SightScene): SightPolicy {
  return scene.lightingEnabled ? lightingEngineSightPolicy : rangeOnlySightPolicy;
}
