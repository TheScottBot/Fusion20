import { describe, expect, it } from "vitest";
import { createPropertyReader, roll20PageProperties, roll20TokenProperties } from "../testing/index.ts";
import { interpretBattlefield, type BattlefieldObjects } from "./battlefield_interpretation.ts";

const noObjects: BattlefieldObjects = { paths: [], doors: [], windows: [], graphics: [] };

function page(overrides: Record<string, unknown> = {}) {
  return createPropertyReader("page-fixture", { ...roll20PageProperties, ...overrides });
}

function interpreted(objects: Partial<BattlefieldObjects>, pageOverrides: Record<string, unknown> = {}) {
  const interpretation = interpretBattlefield(page(pageOverrides), { ...noObjects, ...objects });
  if (interpretation.outcome === "unusable") {
    throw new Error(`Expected a battlefield, got ${interpretation.reason}`);
  }
  return interpretation.battlefield;
}

function roomWall(id: string, layer = "walls", extra: Record<string, unknown> = {}) {
  return createPropertyReader(id, {
    layer,
    barrierType: "wall",
    oneWayReversed: false,
    shape: "pol",
    points: "[[0,0],[420,0],[420,280],[0,280],[0,0]]",
    x: 280,
    y: 210,
    rotation: 0,
    ...extra,
  });
}

function token(id: string, extra: Record<string, unknown> = {}) {
  return createPropertyReader(id, { ...roll20TokenProperties, ...extra });
}

describe("interpretBattlefield, the page", () => {
  it("reads the grid and the lighting state", () => {
    const battlefield = interpreted({});
    expect(battlefield.grid).toEqual({ diagonalRule: "foure", scaleNumber: 5, snappingIncrement: 1 });
    expect(battlefield.scene).toMatchObject({ lightingEnabled: true, daylightEnabled: true, daylightOpacity: 0.9 });
  });

  it.each([
    [{ grid_type: "hex" }, "grid is not square"],
    [{ diagonaltype: "euclidean" }, "unknown diagonal rule"],
    [{ scale_number: 0 }, "grid size is not usable"],
    [{ scale_units: "m" }, "unsupported scale units"],
    [{ dynamic_lighting_enabled: "yes" }, "page is not readable"],
  ])("refuses page %j as %s", (pageOverrides, reason) => {
    expect(interpretBattlefield(page(pageOverrides), noObjects)).toEqual({ outcome: "unusable", reason });
  });
});

describe("interpretBattlefield, walls", () => {
  it("turns a room outline into four segments where Roll20 drew it, centred on x and y (FF43)", () => {
    const battlefield = interpreted({ paths: [roomWall("room")] });
    expect(battlefield.scene.barriers).toEqual([
      { kind: "wall", start: { x: 70, y: 70 }, end: { x: 490, y: 70 } },
      { kind: "wall", start: { x: 490, y: 70 }, end: { x: 490, y: 350 } },
      { kind: "wall", start: { x: 490, y: 350 }, end: { x: 70, y: 350 } },
      { kind: "wall", start: { x: 70, y: 350 }, end: { x: 70, y: 70 } },
    ]);
  });

  it("ignores a drawing on the map layer, even though its barrierType says wall (FF42)", () => {
    expect(interpreted({ paths: [roomWall("drawing", "map")] }).scene.barriers).toEqual([]);
  });

  it.each([
    ["transparent", false, "transparent"],
    ["oneWay", false, "one way"],
    ["oneWay", true, "one way"],
  ] as const)("reads barrier type %s, reversed %s", (barrierType, oneWayReversed, kind) => {
    const divider = roomWall("divider", "walls", { barrierType, oneWayReversed, points: "[[0,0],[0,280]]" });
    const [segment] = interpreted({ paths: [divider] }).scene.barriers;
    expect(segment).toMatchObject({ kind });
    if (kind === "one way") {
      expect(segment).toMatchObject({ isReversed: oneWayReversed });
    }
  });

  it("rotates a wall about its centre, clockwise on the page, which is not yet observed", () => {
    const horizontal = roomWall("rotated", "walls", { points: "[[0,0],[140,0]]", x: 100, y: 100, rotation: 90 });
    const [segment] = interpreted({ paths: [horizontal] }).scene.barriers;
    expect(segment?.start.x).toBeCloseTo(100, 6);
    expect(segment?.start.y).toBeCloseTo(30, 6);
    expect(segment?.end.x).toBeCloseTo(100, 6);
    expect(segment?.end.y).toBeCloseTo(170, 6);
  });

  it.each([
    ["an unsupported shape", { shape: "eli" }, "unsupported wall shape"],
    ["an unknown barrier type", { barrierType: "glass" }, "unknown barrier type"],
    ["points that are not JSON", { points: "[[0,0],[1" }, "unreadable wall points"],
    ["points that are not pairs", { points: "[[0,0,0],[1,1,1]]" }, "unreadable wall points"],
    ["a single point", { points: "[[0,0]]" }, "unreadable wall points"],
    ["a position that is not a number", { x: "near" }, "unreadable object"],
  ])("skips a wall with %s, and says so", (_description, extra, reason) => {
    const battlefield = interpreted({ paths: [roomWall("broken", "walls", extra)] });
    expect(battlefield.scene.barriers).toEqual([]);
    expect(battlefield.skipped).toEqual([{ id: "broken", reason }]);
  });

  it("skips a wall with too many points rather than reading an unbounded list", () => {
    const manyPoints = JSON.stringify(Array.from({ length: 600 }, (_unused, pointIndex) => [pointIndex, 0]));
    const battlefield = interpreted({ paths: [roomWall("huge", "walls", { points: manyPoints })] });
    expect(battlefield.skipped).toEqual([{ id: "huge", reason: "unreadable wall points" }]);
  });
});

describe("interpretBattlefield, doors and windows", () => {
  const doorFields = {
    x: 770,
    y: -560,
    isOpen: false,
    isLocked: false,
    isSecret: false,
    path: { handle0: { x: 0, y: 140 }, handle1: { x: 0, y: -140 } },
  };

  it("flips a door's inverted y onto the page (FF1)", () => {
    const battlefield = interpreted({ doors: [createPropertyReader("door", doorFields)] });
    expect(battlefield.scene.barriers).toEqual([
      { kind: "door", isOpen: false, start: { x: 770, y: 420 }, end: { x: 770, y: 700 } },
    ]);
  });

  it("reads an open door", () => {
    const battlefield = interpreted({ doors: [createPropertyReader("door", { ...doorFields, isOpen: true })] });
    expect(battlefield.scene.barriers).toMatchObject([{ kind: "door", isOpen: true }]);
  });

  it("reads a window, whose open state does not matter for sight", () => {
    const battlefield = interpreted({ windows: [createPropertyReader("window", doorFields)] });
    expect(battlefield.scene.barriers).toEqual([
      { kind: "window", start: { x: 770, y: 420 }, end: { x: 770, y: 700 } },
    ]);
  });

  it("skips a door with no handles", () => {
    const battlefield = interpreted({ doors: [createPropertyReader("door", { ...doorFields, path: undefined })] });
    expect(battlefield.skipped).toEqual([{ id: "door", reason: "unreadable object" }]);
  });
});

describe("interpretBattlefield, tokens and light", () => {
  it("turns a token's centre and size into a footprint and a sight target (FF44)", () => {
    const [battleToken] = interpreted({ graphics: [token("niamh", { represents: "character-niamh" })] }).tokens;
    expect(battleToken).toMatchObject({
      id: "niamh",
      represents: "character-niamh",
      footprint: { firstColumn: 13, lastColumn: 13, firstRow: 6, lastRow: 6 },
      sightTarget: { centre: { x: 945, y: 455 }, width: 70, height: 70 },
    });
  });

  it("reads vision, night vision reach and fields of vision", () => {
    const viewer = token("viewer", {
      has_bright_light_vision: true,
      has_night_vision: true,
      night_vision_distance: 60,
      has_limit_field_of_vision: true,
      limit_field_of_vision_center: 90,
      limit_field_of_vision_total: 120,
    });
    const [battleToken] = interpreted({ graphics: [viewer] }).tokens;
    expect(battleToken?.viewer).toEqual({
      position: { x: 945, y: 455 },
      hasVision: true,
      nightVisionReach: 875,
      fieldOfVision: { centreDegrees: 90, totalDegrees: 120 },
      nightFieldOfVision: undefined,
    });
  });

  it("treats a nameless graphic that represents nobody, such as a torch, as light and not a token (FF46)", () => {
    const torch = token("torch", {
      name: "",
      width: 48,
      height: 48,
      emits_bright_light: true,
      bright_light_distance: 20,
      emits_low_light: true,
      low_light_distance: 40,
    });
    const battlefield = interpreted({ graphics: [torch] });
    expect(battlefield.tokens).toEqual([]);
    expect(battlefield.scene.lights).toEqual([{ position: { x: 945, y: 455 }, reach: 584, beam: undefined }]);
  });

  it("reads a directional light's beam", () => {
    const lamp = token("lamp", {
      emits_bright_light: true,
      bright_light_distance: 10,
      has_directional_bright_light: true,
      directional_bright_light_center: 180,
      directional_bright_light_total: 60,
    });
    expect(interpreted({ graphics: [lamp] }).scene.lights).toMatchObject([
      { beam: { centreDegrees: 180, totalDegrees: 60 } },
    ]);
  });

  it("reads players and status markers for ally checks", () => {
    const marked = token("marked", { controlledby: "player-alpha, player-beta", statusmarkers: "blue,skull@2" });
    expect(interpreted({ graphics: [marked] }).tokens[0]).toMatchObject({
      controlledBy: ["player-alpha", "player-beta"],
      statusMarkers: ["blue", "skull"],
    });
  });

  it.each([
    ["the GM layer", { layer: "gmlayer" }],
    ["the map layer", { layer: "map" }],
    ["a card", { _subtype: "card" }],
  ])("leaves out a graphic on %s", (_description, extra) => {
    expect(interpreted({ graphics: [token("other", extra)] }).tokens).toEqual([]);
  });

  it("skips a token whose size is not a number", () => {
    const battlefield = interpreted({ graphics: [token("broken", { width: "wide" })] });
    expect(battlefield.tokens).toEqual([]);
    expect(battlefield.skipped).toEqual([{ id: "broken", reason: "unreadable object" }]);
  });
});
