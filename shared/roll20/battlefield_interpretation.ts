import {
  createSquareGrid,
  createTokenFootprint,
  type SquareGrid,
  type TokenFootprint,
} from "../domain/grid_geometry.ts";
import type { PagePoint, SightBarrier } from "../domain/line_of_sight.ts";
import type { AngularField, LightSource, SightScene, SightTarget, SightViewer } from "../domain/sight_policy.ts";
import { readPlayerList } from "./ally_interpretation.ts";
import { isRecord, readFiniteNumber, readText } from "./untrusted_value.ts";

// Read through a get accessor only, so the same interpreter serves Mod objects and, if Plan's
// guess holds, the client's models (section 2 of the specification).
export interface PropertyReader {
  readonly id: string;
  get(propertyName: string): unknown;
}

export interface BattlefieldObjects {
  readonly paths: readonly PropertyReader[];
  readonly doors: readonly PropertyReader[];
  readonly windows: readonly PropertyReader[];
  readonly graphics: readonly PropertyReader[];
}

export interface BattlefieldToken {
  readonly id: string;
  readonly name: string;
  readonly represents: string;
  readonly controlledBy: readonly string[];
  readonly statusMarkers: readonly string[];
  readonly footprint: TokenFootprint;
  readonly sightTarget: SightTarget;
  readonly viewer: SightViewer;
}

export type SkipReason =
  "unreadable object" | "unknown barrier type" | "unsupported wall shape" | "unreadable wall points";

export interface Battlefield {
  readonly grid: SquareGrid;
  readonly scene: SightScene;
  readonly tokens: readonly BattlefieldToken[];
  readonly skipped: readonly { readonly id: string; readonly reason: SkipReason }[];
}

export type BattlefieldInterpretation =
  | { readonly outcome: "interpreted"; readonly battlefield: Battlefield }
  | {
      readonly outcome: "unusable";
      readonly reason:
        | "page is not readable"
        | "unsupported scale units"
        | "grid is not square"
        | "unknown diagonal rule"
        | "grid size is not usable";
    };

// Observed, not documented: a 70 pixel token fills one cell, and a 25 unit page is 1750 pixels
// across (FF44).
const pixelsPerUnit = 70;
// Range profiles are written in feet, so a page in any other unit would compare unlike values (FF58).
const supportedScaleUnits = "ft";
const wallLayer = "walls";
const tokenLayer = "objects";
const tokenSubtype = "token";
const maximumWallPointsLength = 20_000;
const maximumWallPoints = 500;
const supportedWallShapes = new Set(["pol", "free"]);

type SegmentBarrier = Pick<SightBarrier, "start" | "end">;

function readBarrierKind(
  barrierType: unknown,
  oneWayReversed: unknown,
): ((segment: SegmentBarrier) => SightBarrier) | undefined {
  if (barrierType === "wall") {
    return (segment) => ({ kind: "wall", ...segment });
  }
  if (barrierType === "transparent") {
    return (segment) => ({ kind: "transparent", ...segment });
  }
  if (barrierType === "oneWay") {
    const isReversed = oneWayReversed === true;
    return (segment) => ({ kind: "one way", isReversed, ...segment });
  }
  return undefined;
}

function readWallPoints(rawPoints: unknown): readonly PagePoint[] | undefined {
  const pointsText = readText(rawPoints);
  if (pointsText === undefined || pointsText.length > maximumWallPointsLength) {
    return undefined;
  }
  let parsedPoints: unknown;
  try {
    parsedPoints = JSON.parse(pointsText);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsedPoints) || parsedPoints.length < 2 || parsedPoints.length > maximumWallPoints) {
    return undefined;
  }
  const points: PagePoint[] = [];
  for (const parsedPoint of parsedPoints) {
    if (!Array.isArray(parsedPoint) || parsedPoint.length !== 2) {
      return undefined;
    }
    const [across, down] = parsedPoint.map(readFiniteNumber);
    if (across === undefined || down === undefined) {
      return undefined;
    }
    points.push({ x: across, y: down });
  }
  return points;
}

// pathv2 points are relative, and x and y are the centre of their bounding box (FF43). Rotation
// is clockwise on the page, which is the usual canvas convention but has not been observed.
function placeWallPoints(
  points: readonly PagePoint[],
  centre: PagePoint,
  rotationDegrees: number,
): readonly PagePoint[] {
  const acrossValues = points.map((point) => point.x);
  const downValues = points.map((point) => point.y);
  const boxCentre = {
    x: (Math.min(...acrossValues) + Math.max(...acrossValues)) / 2,
    y: (Math.min(...downValues) + Math.max(...downValues)) / 2,
  };
  const radians = (rotationDegrees * Math.PI) / 180;
  return points.map((point) => {
    const offsetAcross = point.x - boxCentre.x;
    const offsetDown = point.y - boxCentre.y;
    return {
      x: centre.x + offsetAcross * Math.cos(radians) - offsetDown * Math.sin(radians),
      y: centre.y + offsetAcross * Math.sin(radians) + offsetDown * Math.cos(radians),
    };
  });
}

function interpretWall(path: PropertyReader): readonly SightBarrier[] | SkipReason | undefined {
  // Every pathv2 carries barrierType, including map drawings, so only the layer says wall (FF42).
  if (path.get("layer") !== wallLayer) {
    return undefined;
  }
  const centreAcross = readFiniteNumber(path.get("x"));
  const centreDown = readFiniteNumber(path.get("y"));
  const rotation = readFiniteNumber(path.get("rotation") ?? 0);
  if (centreAcross === undefined || centreDown === undefined || rotation === undefined) {
    return "unreadable object";
  }
  const toBarrier = readBarrierKind(path.get("barrierType"), path.get("oneWayReversed"));
  if (toBarrier === undefined) {
    return "unknown barrier type";
  }
  if (!supportedWallShapes.has(String(path.get("shape")))) {
    return "unsupported wall shape";
  }
  const points = readWallPoints(path.get("points"));
  if (points === undefined) {
    return "unreadable wall points";
  }
  const placedPoints = placeWallPoints(points, { x: centreAcross, y: centreDown }, rotation);
  return placedPoints.slice(1).flatMap((end, pointIndex) => {
    const start = placedPoints[pointIndex];
    return start === undefined ? [] : [toBarrier({ start, end })];
  });
}

function readHandle(openingHandle: unknown): PagePoint | undefined {
  if (!isRecord(openingHandle)) {
    return undefined;
  }
  const across = readFiniteNumber(openingHandle.x);
  const down = readFiniteNumber(openingHandle.y);
  return across === undefined || down === undefined ? undefined : { x: across, y: down };
}

// Doors and windows store y inverted, and their handles are offsets in that same inverted axis (FF1).
function readOpeningSegment(opening: PropertyReader): SegmentBarrier | undefined {
  const centreAcross = readFiniteNumber(opening.get("x"));
  const invertedDown = readFiniteNumber(opening.get("y"));
  const handles = opening.get("path");
  if (centreAcross === undefined || invertedDown === undefined || !isRecord(handles)) {
    return undefined;
  }
  const firstHandle = readHandle(handles.handle0);
  const secondHandle = readHandle(handles.handle1);
  if (firstHandle === undefined || secondHandle === undefined) {
    return undefined;
  }
  return {
    start: { x: centreAcross + firstHandle.x, y: -(invertedDown + firstHandle.y) },
    end: { x: centreAcross + secondHandle.x, y: -(invertedDown + secondHandle.y) },
  };
}

function readStatusMarkers(rawValue: unknown): readonly string[] {
  // A marker may carry a number, as in skull@2, which is not part of its name.
  return (readText(rawValue) ?? "")
    .split(",")
    .map((marker) => marker.split("@")[0]?.trim() ?? "")
    .filter((marker) => marker.length > 0);
}

function readField(
  graphic: PropertyReader,
  enabledProperty: string,
  centreProperty: string,
  totalProperty: string,
): AngularField | undefined {
  if (graphic.get(enabledProperty) !== true) {
    return undefined;
  }
  // Passed through in Roll20's own numbers, whose convention FE7 has not observed (FF53).
  return {
    centreDegrees: readFiniteNumber(graphic.get(centreProperty)) ?? 0,
    totalDegrees: readFiniteNumber(graphic.get(totalProperty)) ?? 0,
  };
}

export function interpretBattlefield(page: PropertyReader, objects: BattlefieldObjects): BattlefieldInterpretation {
  const lightingEnabled = page.get("dynamic_lighting_enabled");
  const daylightEnabled = page.get("daylight_mode_enabled");
  const daylightOpacity = readFiniteNumber(page.get("daylightModeOpacity"));
  const gridType = readText(page.get("grid_type"));
  const diagonalRule = readText(page.get("diagonaltype"));
  const scaleNumber = readFiniteNumber(page.get("scale_number"));
  const snappingIncrement = readFiniteNumber(page.get("snapping_increment"));
  if (
    typeof lightingEnabled !== "boolean" ||
    typeof daylightEnabled !== "boolean" ||
    daylightOpacity === undefined ||
    gridType === undefined ||
    diagonalRule === undefined ||
    scaleNumber === undefined ||
    snappingIncrement === undefined
  ) {
    return { outcome: "unusable", reason: "page is not readable" };
  }
  const gridCreation = createSquareGrid({ gridType, diagonalRule, scaleNumber, snappingIncrement });
  if (gridCreation.outcome === "refused") {
    return { outcome: "unusable", reason: gridCreation.reason };
  }
  if (page.get("scale_units") !== supportedScaleUnits) {
    return { outcome: "unusable", reason: "unsupported scale units" };
  }
  const { grid } = gridCreation;
  const feetToPixels = (feet: number): number => (feet / scaleNumber) * pixelsPerUnit;
  const skipped: { id: string; reason: SkipReason }[] = [];
  const barriers: SightBarrier[] = [];

  for (const path of objects.paths) {
    const wallReading = interpretWall(path);
    if (typeof wallReading === "string") {
      skipped.push({ id: path.id, reason: wallReading });
    } else if (wallReading !== undefined) {
      barriers.push(...wallReading);
    }
  }
  for (const door of objects.doors) {
    const segment = readOpeningSegment(door);
    const isOpen = door.get("isOpen");
    if (segment === undefined || typeof isOpen !== "boolean") {
      skipped.push({ id: door.id, reason: "unreadable object" });
    } else {
      barriers.push({ kind: "door", isOpen, ...segment });
    }
  }
  for (const roll20Window of objects.windows) {
    const segment = readOpeningSegment(roll20Window);
    if (segment === undefined) {
      skipped.push({ id: roll20Window.id, reason: "unreadable object" });
    } else {
      barriers.push({ kind: "window", ...segment });
    }
  }

  const lights: LightSource[] = [];
  const tokens: BattlefieldToken[] = [];
  for (const graphic of objects.graphics) {
    const left = readFiniteNumber(graphic.get("left"));
    const top = readFiniteNumber(graphic.get("top"));
    const width = readFiniteNumber(graphic.get("width"));
    const height = readFiniteNumber(graphic.get("height"));
    if (left === undefined || top === undefined || width === undefined || height === undefined) {
      skipped.push({ id: graphic.id, reason: "unreadable object" });
      continue;
    }
    const position = { x: left, y: top };
    // A light reaches from the token's edge, as the experiment 5 lamps appeared to (FF48).
    const halfWidth = width / 2;
    const emitsBright = graphic.get("emits_bright_light") === true;
    const emitsDim = graphic.get("emits_low_light") === true;
    if (emitsBright || emitsDim) {
      const brightFeet = emitsBright ? (readFiniteNumber(graphic.get("bright_light_distance")) ?? 0) : 0;
      const dimFeet = emitsDim ? (readFiniteNumber(graphic.get("low_light_distance")) ?? 0) : 0;
      lights.push({
        position,
        reach: feetToPixels(Math.max(brightFeet, dimFeet)) + halfWidth,
        beam: readField(
          graphic,
          "has_directional_bright_light",
          "directional_bright_light_center",
          "directional_bright_light_total",
        ),
      });
    }
    const name = readText(graphic.get("name")) ?? "";
    const represents = readText(graphic.get("represents")) ?? "";
    // FD16 as amended: a light token has neither, and is not something to target or nominate (FF46).
    const isCombatant =
      graphic.get("_subtype") === tokenSubtype &&
      graphic.get("layer") === tokenLayer &&
      (name.length > 0 || represents.length > 0);
    if (!isCombatant) {
      continue;
    }
    const footprintCreation = createTokenFootprint(
      {
        leftUnits: (left - halfWidth) / pixelsPerUnit,
        topUnits: (top - height / 2) / pixelsPerUnit,
        widthUnits: width / pixelsPerUnit,
        heightUnits: height / pixelsPerUnit,
      },
      grid,
    );
    if (footprintCreation.outcome === "refused") {
      skipped.push({ id: graphic.id, reason: "unreadable object" });
      continue;
    }
    const hasNightVision = graphic.get("has_night_vision") === true;
    const nightVisionFeet = readFiniteNumber(graphic.get("night_vision_distance")) ?? 0;
    tokens.push({
      id: graphic.id,
      name,
      represents,
      controlledBy: readPlayerList(graphic.get("controlledby")),
      statusMarkers: readStatusMarkers(graphic.get("statusmarkers")),
      footprint: footprintCreation.footprint,
      sightTarget: { centre: position, width, height },
      viewer: {
        position,
        hasVision: graphic.get("has_bright_light_vision") === true,
        nightVisionReach: hasNightVision ? feetToPixels(nightVisionFeet) + halfWidth : 0,
        fieldOfVision: readField(
          graphic,
          "has_limit_field_of_vision",
          "limit_field_of_vision_center",
          "limit_field_of_vision_total",
        ),
        nightFieldOfVision: readField(
          graphic,
          "has_limit_field_of_night_vision",
          "limit_field_of_night_vision_center",
          "limit_field_of_night_vision_total",
        ),
      },
    });
  }

  return {
    outcome: "interpreted",
    battlefield: {
      grid,
      scene: { lightingEnabled, daylightEnabled, daylightOpacity, barriers, lights },
      tokens,
      skipped,
    },
  };
}
