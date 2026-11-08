import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildBeyond20Message, buildDigitalInlineRoll, buildRolledInlineRoll } from "../testing/index.ts";
import { interpretBeyond20Roll } from "./beyond20_roll_interpretation.ts";

const advantageFields = "{{r1=$[[0]]}} {{r2=$[[1]]}} {{advantage=1}} {{attack=1}} {{mod=+7}}";
const disadvantageFields = "{{r1=$[[0]]}} {{r2=$[[1]]}} {{disadvantage=1}} {{attack=1}} {{mod=+7}}";

function attackFrom(message: ReturnType<typeof buildBeyond20Message>) {
  const reading = interpretBeyond20Roll(message);
  if (reading.outcome !== "attack") {
    throw new Error(`Expected an attack, got ${reading.outcome}: ${reading.reason}`);
  }
  return reading;
}

describe("interpretBeyond20Roll on digital dice, as captured", () => {
  it("reads a natural 20 with its marker as a critical at 20", () => {
    const message = buildBeyond20Message({ inlineRolls: [buildDigitalInlineRoll(20, "critical")] });
    expect(interpretBeyond20Roll(message)).toEqual({
      outcome: "attack",
      characterName: "Fixture Fighter",
      playerId: "player-alpha",
      keptNaturalD20: 20,
      criticalThreshold: 20,
    });
  });

  it("gives a Champion's marked natural 19 a threshold of 19, under FD18", () => {
    const message = buildBeyond20Message({ inlineRolls: [buildDigitalInlineRoll(19, "critical")] });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 19, criticalThreshold: 19 });
  });

  it("leaves an unmarked natural 19 at threshold 20, as for the Barbarian", () => {
    const message = buildBeyond20Message({ inlineRolls: [buildDigitalInlineRoll(19)] });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 19, criticalThreshold: 20 });
  });

  it("does not let a forced critical's marker on a natural 12 lower the threshold", () => {
    const message = buildBeyond20Message({ inlineRolls: [buildDigitalInlineRoll(12, "critical")] });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 12, criticalThreshold: 20 });
  });

  it("keeps the higher roll under advantage, with that roll's marker", () => {
    const message = buildBeyond20Message({
      fields: advantageFields,
      inlineRolls: [buildDigitalInlineRoll(19, "critical"), buildDigitalInlineRoll(16)],
    });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 19, criticalThreshold: 19 });
  });

  it("keeps the lower roll under disadvantage", () => {
    const message = buildBeyond20Message({
      fields: disadvantageFields,
      inlineRolls: [buildDigitalInlineRoll(14), buildDigitalInlineRoll(11)],
    });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 11, criticalThreshold: 20 });
  });

  it("ignores the marker on a dropped natural 20 under disadvantage (FF74)", () => {
    const message = buildBeyond20Message({
      fields: disadvantageFields,
      inlineRolls: [buildDigitalInlineRoll(20, "critical"), buildDigitalInlineRoll(5)],
    });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 5, criticalThreshold: 20 });
  });
});

describe("interpretBeyond20Roll, markers on the kept roll only", () => {
  it("does not lend a dropped roll's marker to a kept unmarked 19 under disadvantage", () => {
    const message = buildBeyond20Message({
      fields: disadvantageFields,
      inlineRolls: [buildDigitalInlineRoll(20, "critical"), buildDigitalInlineRoll(19)],
    });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 19, criticalThreshold: 20 });
  });
});

describe("interpretBeyond20Roll on Roll20's own dice, as the battery recorded them", () => {
  it("reads a Champion's cs>19", () => {
    const message = buildBeyond20Message({
      template: "atkdmg",
      inlineRolls: [buildRolledInlineRoll([{ value: 19 }], 19)],
    });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 19, criticalThreshold: 19 });
  });

  it("treats a forced critical's cs>1 as threshold 20, under FD17", () => {
    const message = buildBeyond20Message({
      template: "atkdmg",
      inlineRolls: [buildRolledInlineRoll([{ value: 7 }], 1)],
    });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 7, criticalThreshold: 20 });
  });

  it("keeps the highest of three dice under super advantage", () => {
    const message = buildBeyond20Message({
      template: "atkdmg",
      fields: advantageFields,
      inlineRolls: [
        buildRolledInlineRoll([{ value: 16 }]),
        buildRolledInlineRoll([{ value: 18 }, { value: 8, isDropped: true }]),
      ],
    });
    expect(attackFrom(message)).toMatchObject({ keptNaturalD20: 18 });
  });
});

describe("interpretBeyond20Roll on rolls that are not attacks", () => {
  it.each([
    [
      "a skill check, which has an empty mod (FF29)",
      buildBeyond20Message({ fields: "{{r1=$[[0]]}} {{normal=1}} {{attack=1}} {{mod=}}" }),
    ],
    ["a damage roll", buildBeyond20Message({ template: "dmg", fields: "{{damage=1}} {{dmg1=$[[0]]}} {{crit=1}}" })],
    [
      "a traits post",
      buildBeyond20Message({ template: "traits", fields: "{{name=}} {{source=action}}", inlineRolls: [] }),
    ],
    ["a template with no attack field", buildBeyond20Message({ fields: "{{r1=$[[0]]}} {{normal=1}} {{mod=+7}}" })],
  ])("ignores %s", (_description, message) => {
    expect(interpretBeyond20Roll(message).outcome).toBe("ignored");
  });

  it("ignores a damage template even if it carried attack fields, by its template alone", () => {
    const message = buildBeyond20Message({ template: "dmg" });
    expect(interpretBeyond20Roll(message)).toEqual({ outcome: "ignored", reason: "not an attack template" });
  });

  it("ignores plain chat with no template", () => {
    expect(
      interpretBeyond20Roll({ content: "hello", inlinerolls: undefined, rolltemplate: undefined, playerid: "p" }),
    ).toEqual({
      outcome: "ignored",
      reason: "no roll template",
    });
  });

  it("ignores a skill check with advantage even when it rolled a marked natural 20", () => {
    const message = buildBeyond20Message({
      fields: "{{r1=$[[0]]}} {{r2=$[[1]]}} {{advantage=1}} {{attack=1}} {{mod=}}",
      inlineRolls: [buildDigitalInlineRoll(4), buildDigitalInlineRoll(20, "critical")],
    });
    expect(interpretBeyond20Roll(message)).toEqual({ outcome: "ignored", reason: "not an attack" });
  });
});

describe("interpretBeyond20Roll on malformed attacks", () => {
  it("trims the trailing space Beyond20 leaves on a character name", () => {
    expect(attackFrom(buildBeyond20Message({ characterName: "Fixture Barbarian " }))).toMatchObject({
      characterName: "Fixture Barbarian",
    });
  });

  it.each([
    [
      "roll twice, which has no kept die",
      {
        fields: "{{r1=$[[0]]}} {{r2=$[[1]]}} {{always=1}} {{attack=1}} {{mod=+7}}",
        inlineRolls: [buildDigitalInlineRoll(4), buildDigitalInlineRoll(9)],
      },
      "no kept die",
    ],
    ["no character name", { characterName: "" }, "missing character name"],
    ["a roll reference to nothing", { fields: "{{r1=$[[3]]}} {{normal=1}} {{attack=1}} {{mod=+7}}" }, "missing roll"],
    ["no roll at all", { fields: "{{normal=1}} {{attack=1}} {{mod=+7}}" }, "missing roll"],
    [
      "one roll of each format",
      { fields: advantageFields, inlineRolls: [buildDigitalInlineRoll(4), buildRolledInlineRoll([{ value: 9 }])] },
      "mixed roll formats",
    ],
    [
      "advantage with only one roll",
      { fields: "{{r1=$[[0]]}} {{advantage=1}} {{attack=1}} {{mod=+7}}" },
      "missing roll",
    ],
    ["no roll mode", { fields: "{{r1=$[[0]]}} {{attack=1}} {{mod=+7}}" }, "no kept die"],
  ])("refuses %s", (_description, fixture, reason) => {
    expect(interpretBeyond20Roll(buildBeyond20Message(fixture))).toEqual({ outcome: "unreadable", reason });
  });

  it("passes an inline roll's own refusal through", () => {
    const message = buildBeyond20Message({ inlineRolls: [buildRolledInlineRoll([{ value: 25 }])] });
    expect(interpretBeyond20Roll(message)).toEqual({ outcome: "unreadable", reason: "die out of range" });
  });

  it("refuses a message larger than its bound before reading it", () => {
    const message = buildBeyond20Message({ fields: `{{attack=1}} ${"x".repeat(5000)}` });
    expect(interpretBeyond20Roll(message)).toEqual({ outcome: "unreadable", reason: "message too large" });
  });

  it("refuses a missing player", () => {
    const message = { ...buildBeyond20Message(), playerid: undefined };
    expect(interpretBeyond20Roll(message)).toEqual({ outcome: "unreadable", reason: "missing player" });
  });
});

describe("fuzz: interpretBeyond20Roll", () => {
  it("never throws on arbitrary message fields", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.anything(),
        fc.anything(),
        fc.anything(),
        (content, inlinerolls, rolltemplate, playerid) => {
          const reading = interpretBeyond20Roll({ content, inlinerolls, rolltemplate, playerid });
          expect(["attack", "ignored", "unreadable"]).toContain(reading.outcome);
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it("never throws on hostile template text with real rolls", () => {
    const templateFragments = fc.constantFrom(
      "{{",
      "}}",
      "=",
      "r1",
      "$[[0]]",
      "attack",
      "1",
      "mod",
      "+7",
      "advantage",
      " ",
      "charname",
    );
    const hostileContent = fc.array(templateFragments, { maxLength: 30 }).map((fragments) => fragments.join(""));
    fc.assert(
      fc.property(hostileContent, (content) => {
        const reading = interpretBeyond20Roll({
          content,
          inlinerolls: [buildDigitalInlineRoll(20, "critical")],
          rolltemplate: "simple",
          playerid: "player-alpha",
        });
        expect(["attack", "ignored", "unreadable"]).toContain(reading.outcome);
      }),
      { numRuns: 10_000 },
    );
  });
});
