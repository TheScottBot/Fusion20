import { describe, expect, it } from "vitest";
import { resolveRoller, type CharacterRecord } from "./roller_resolution.ts";

const characters: readonly CharacterRecord[] = [
  { id: "character-fighter", name: "Fixture Fighter", controlledBy: ["player-alpha"] },
  { id: "character-open", name: "Open Hero", controlledBy: ["all"] },
  { id: "character-twin-one", name: "Twin", controlledBy: ["player-alpha"] },
  { id: "character-twin-two", name: "Twin", controlledBy: ["player-alpha"] },
  { id: "character-monster", name: "Goblin Boss", controlledBy: [] },
];

const tokens = [
  { id: "token-fighter", represents: "character-fighter" },
  { id: "token-open", represents: "character-open" },
  { id: "token-boss-one", represents: "character-monster" },
  { id: "token-boss-two", represents: "character-monster" },
];

function poster(characterName: string, playerId = "player-alpha", posterIsGameMaster = false) {
  return { characterName, playerId, posterIsGameMaster };
}

describe("resolveRoller, under FD19", () => {
  it("resolves a character the poster controls to its one token", () => {
    expect(resolveRoller(poster("Fixture Fighter"), characters, tokens)).toEqual({
      outcome: "resolved",
      tokenId: "token-fighter",
    });
  });

  it("matches the name ignoring case and outer spaces, as Beyond20 does", () => {
    expect(resolveRoller(poster("  fixture fighter "), characters, tokens)).toMatchObject({ outcome: "resolved" });
  });

  it("refuses a poster who does not control the character", () => {
    expect(resolveRoller(poster("Fixture Fighter", "player-beta"), characters, tokens)).toEqual({
      outcome: "refused",
      reason: "poster does not control character",
    });
  });

  it("lets anyone roll for a character controlled by all players", () => {
    expect(resolveRoller(poster("Open Hero", "player-beta"), characters, tokens)).toMatchObject({
      outcome: "resolved",
    });
  });

  it("lets the GM roll for anyone, which is how monsters attack", () => {
    expect(resolveRoller(poster("Goblin Boss", "player-gm", true), characters, tokens)).toEqual({
      outcome: "choose",
      tokenIds: ["token-boss-one", "token-boss-two"],
    });
  });

  it("asks which token when a character has several on the page", () => {
    const boss = { id: "character-monster", name: "Goblin Boss", controlledBy: ["player-alpha"] };
    expect(resolveRoller(poster("Goblin Boss"), [boss], tokens)).toMatchObject({ outcome: "choose" });
  });

  it.each([
    ["an unknown name", poster("Nobody"), "unknown character"],
    ["a name two characters share", poster("Twin"), "ambiguous character name"],
  ])("refuses %s", (_description, posterDetails, reason) => {
    expect(resolveRoller(posterDetails, characters, tokens)).toEqual({ outcome: "refused", reason });
  });

  it("is not blocked by another player's sheet with the same name (FF108)", () => {
    const copycat = { id: "character-copycat", name: "fixture fighter", controlledBy: ["player-beta"] };
    expect([
      resolveRoller(poster("Fixture Fighter"), [...characters, copycat], tokens),
      resolveRoller(poster("Fixture Fighter", "player-beta"), [...characters, copycat], tokens),
    ]).toEqual([
      { outcome: "resolved", tokenId: "token-fighter" },
      { outcome: "refused", reason: "no token on page" },
    ]);
  });

  it("still asks the GM to tell apart two characters with one name, since the GM controls both", () => {
    const twinMonster = { id: "character-monster-two", name: "Goblin Boss", controlledBy: [] };
    expect(resolveRoller(poster("Goblin Boss", "player-gm", true), [...characters, twinMonster], tokens)).toEqual({
      outcome: "refused",
      reason: "ambiguous character name",
    });
  });

  it("refuses a character with no token on the page", () => {
    expect(resolveRoller(poster("Fixture Fighter"), characters, [])).toEqual({
      outcome: "refused",
      reason: "no token on page",
    });
  });
});
