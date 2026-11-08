import { describe, expect, it } from "vitest";
import { isAlly, readPlayerList } from "./ally_interpretation.ts";

const characterPlayers = new Map<string, readonly string[]>([
  ["character-hero", ["player-alpha"]],
  ["character-monster", []],
]);

function lookUpPlayers(characterId: string): readonly string[] | undefined {
  return characterPlayers.get(characterId);
}

function token(fields: { controlledBy?: readonly string[]; represents?: string; statusMarkers?: readonly string[] }) {
  return {
    controlledBy: fields.controlledBy ?? [],
    represents: fields.represents ?? "",
    statusMarkers: fields.statusMarkers ?? [],
  };
}

describe("isAlly, under FD3", () => {
  it.each([
    ["a token a player controls", token({ controlledBy: ["player-alpha"] }), "allied", true],
    ["a token whose character a player controls (FF45)", token({ represents: "character-hero" }), "allied", true],
    ["a token controlled by all players", token({ controlledBy: ["all"] }), "allied", true],
    [
      "an allied NPC carrying the GM's marker",
      token({ represents: "character-monster", statusMarkers: ["allied"] }),
      "allied",
      true,
    ],
    ["a marker with a number on it", token({ statusMarkers: ["allied"] }), "allied", true],
    [
      "an enemy with no controller and no marker",
      token({ represents: "character-monster", statusMarkers: ["skull"] }),
      "allied",
      false,
    ],
    ["an NPC marker when no ally marker is configured", token({ statusMarkers: ["allied"] }), undefined, false],
    [
      "a token representing a character that does not exist",
      token({ represents: "character-missing" }),
      "allied",
      false,
    ],
  ])("is right for %s", (_description, candidate, allyMarker, expected) => {
    expect(isAlly(candidate, lookUpPlayers, allyMarker)).toBe(expected);
  });
});

describe("readPlayerList", () => {
  it.each([
    ["player-alpha,player-beta", ["player-alpha", "player-beta"]],
    [" player-alpha , ", ["player-alpha"]],
    ["", []],
    [undefined, []],
    [7, []],
    ["all", ["all"]],
  ])("reads %j", (rawValue, expected) => {
    expect(readPlayerList(rawValue)).toEqual(expected);
  });
});
