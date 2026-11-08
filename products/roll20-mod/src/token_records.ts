import { unnamedTokenText } from "@fusion20/shared/application";
import { readPlayerList } from "@fusion20/shared/roll20";
import type { ModEnvironment, ModObject } from "./mod_environment.ts";

// Roll20 ids, names and player lists read from Mod objects. Interpretation of their meaning
// stays in shared/roll20; this file only finds the objects.

export function readTrimmedText(propertyValue: unknown): string {
  return typeof propertyValue === "string" ? propertyValue.trim() : "";
}

export function findRepresentedCharacter(environment: ModEnvironment, token: ModObject): ModObject | undefined {
  const characterId = readTrimmedText(token.get("represents"));
  return characterId.length > 0 ? environment.getObj("character", characterId) : undefined;
}

// A token is controlled by the players named on it or on the character it represents (FD3).
export function readTokenControllers(environment: ModEnvironment, tokenId: string): readonly string[] {
  const token = environment.getObj("graphic", tokenId);
  if (token === undefined) {
    return [];
  }
  const character = findRepresentedCharacter(environment, token);
  return [...readPlayerList(token.get("controlledby")), ...readPlayerList(character?.get("controlledby"))];
}

export function readCharacterControllers(
  environment: ModEnvironment,
  characterId: string,
): readonly string[] | undefined {
  const character = environment.getObj("character", characterId);
  return character === undefined ? undefined : readPlayerList(character.get("controlledby"));
}

export function nameOfToken(environment: ModEnvironment, tokenId: string): string {
  const token = environment.getObj("graphic", tokenId);
  if (token === undefined) {
    return unnamedTokenText;
  }
  const tokenName = readTrimmedText(token.get("name"));
  const characterName = readTrimmedText(findRepresentedCharacter(environment, token)?.get("name"));
  return tokenName || characterName || unnamedTokenText;
}

export function readPlayerName(environment: ModEnvironment, playerId: string): string {
  return readTrimmedText(environment.getObj("player", playerId)?.get("_displayname"));
}

// The page the player ribbon is on. Players moved to their own page are not followed (FF90).
export function readPlayerPage(environment: ModEnvironment): ModObject | undefined {
  const pageId = readTrimmedText(environment.campaign().get("playerpageid"));
  return pageId.length > 0 ? environment.getObj("page", pageId) : undefined;
}
