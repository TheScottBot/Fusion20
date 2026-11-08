// Synthetic copies of the shapes captured from Roll20 on 7 and 8 November 2026. The values are
// invented, so no real game, character or player id appears in a test (datum 0.17 item 17).

export interface PropertyReaderDouble {
  readonly id: string;
  get(propertyName: string): unknown;
}

export function createPropertyReader(id: string, properties: Readonly<Record<string, unknown>>): PropertyReaderDouble {
  return {
    id,
    get: (propertyName) => (Object.hasOwn(properties, propertyName) ? properties[propertyName] : undefined),
  };
}

export type DigitalMarker = "critical" | "fumble" | "none";

// Beyond20's digital dice format: a total, an optional zero sided marker die, the formula as a
// label and the dice as a comment.
export function buildDigitalInlineRoll(naturalD20: number, marker: DigitalMarker = "none", modifier = 7): unknown {
  const total = naturalD20 + modifier;
  const markerRoll =
    marker === "none"
      ? []
      : [
          {
            dice: 1,
            mods: {
              customCrit: [{ comp: ">=", point: marker === "critical" ? 0 : 1 }],
              customFumble: [{ comp: ">=", point: marker === "fumble" ? 0 : 1 }],
            },
            results: [{ v: 0 }],
            sides: 0,
            type: "R",
          },
        ];
  return {
    expression: `${String(total)} [1d20 + ${String(modifier)}] = (${String(naturalD20)}) + ${String(modifier)}`,
    results: {
      resultType: marker === "none" ? "M" : "sum",
      rolls: [
        { expr: marker === "none" ? total : `${String(total)}+`, type: "M" },
        ...markerRoll,
        { text: `1d20 + ${String(modifier)}`, type: "L" },
        { text: `= (${String(naturalD20)}) + ${String(modifier)}`, type: "C" },
      ],
      total,
      type: "V",
    },
    signature: false,
  };
}

export interface RolledDie {
  readonly value: number;
  readonly isDropped?: boolean;
}

// Roll20's own dice, as the capture script's battery recorded them.
export function buildRolledInlineRoll(dice: readonly RolledDie[], criticalPoint?: number): unknown {
  const mods = criticalPoint === undefined ? {} : { customCrit: [{ comp: ">=", point: criticalPoint }] };
  return {
    expression: "1d20 +7",
    results: {
      type: "V",
      rolls: [
        {
          type: "R",
          dice: dice.length,
          sides: 20,
          mods,
          results: dice.map((die) => (die.isDropped === true ? { v: die.value, d: true } : { v: die.value })),
        },
        { type: "M", expr: "+7" },
      ],
      resultType: "sum",
      total: 0,
    },
    signature: false,
    rollid: null,
  };
}

export function buildMinimumTenInlineRoll(naturalD20: number): unknown {
  return {
    expression: "{1d20, 0d0 + 10}kh1 +7",
    results: {
      type: "V",
      rolls: [
        {
          type: "G",
          rolls: [
            [{ type: "R", dice: 1, sides: 20, mods: {}, results: [{ v: naturalD20 }] }],
            [
              { type: "R", dice: 0, sides: 0, mods: {}, results: [] },
              { type: "M", expr: "+10" },
            ],
          ],
          mods: { keep: { end: "h", count: 1 } },
          resultType: "sum",
          results: [{ v: Math.max(naturalD20, 10) }, { v: Math.min(naturalD20, 10), d: true }],
        },
        { type: "M", expr: "+7" },
      ],
      resultType: "sum",
      total: 0,
    },
  };
}

export interface Beyond20MessageFixture {
  readonly characterName?: string;
  readonly template?: string;
  readonly fields?: string;
  readonly inlineRolls?: readonly unknown[];
  readonly playerId?: string;
}

export function buildBeyond20Message(fixture: Beyond20MessageFixture = {}) {
  const characterName = fixture.characterName ?? "Fixture Fighter";
  const fields = fixture.fields ?? "{{r1=$[[0]]}} {{normal=1}} {{attack=1}} {{mod=+7}}";
  return {
    content: ` {{charname=${characterName}}} {{rname=[Fixture Sword](!beyond20-rendered-roll-button-0.5)}} ${fields}`,
    inlinerolls: fixture.inlineRolls ?? [buildDigitalInlineRoll(12)],
    rolltemplate: fixture.template ?? "simple",
    playerid: fixture.playerId ?? "player-alpha",
  };
}

// A square 5 ft page with lighting and bright daylight on, as the Mod and the page bridge read it.
export const roll20PageProperties: Readonly<Record<string, unknown>> = {
  grid_type: "square",
  diagonaltype: "foure",
  scale_number: 5,
  scale_units: "ft",
  snapping_increment: 1,
  dynamic_lighting_enabled: true,
  daylight_mode_enabled: true,
  daylightModeOpacity: 0.9,
};

// A one square token on the token layer, with no vision or light, at column 13, row 6.
export const roll20TokenProperties: Readonly<Record<string, unknown>> = {
  _subtype: "token",
  name: "Fixture Token",
  represents: "",
  controlledby: "",
  statusmarkers: "",
  layer: "objects",
  left: 945,
  top: 455,
  width: 70,
  height: 70,
  has_bright_light_vision: false,
  has_night_vision: false,
  night_vision_distance: 0,
  emits_bright_light: false,
  bright_light_distance: 0,
  emits_low_light: false,
  low_light_distance: 0,
  has_limit_field_of_vision: false,
  limit_field_of_vision_center: 0,
  limit_field_of_vision_total: 0,
  has_limit_field_of_night_vision: false,
  limit_field_of_night_vision_center: 0,
  limit_field_of_night_vision_total: 0,
  has_directional_bright_light: false,
  directional_bright_light_center: 0,
  directional_bright_light_total: 0,
};
