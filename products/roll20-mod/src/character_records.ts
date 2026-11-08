import type { ActorAuthority, RangeProfileSource } from "@fusion20/shared/application";
import { rangeProfileAttributeName, readRangeProfileValue } from "@fusion20/shared/protocol";
import type { ModEnvironment, ModObject } from "./mod_environment.ts";
import { findRepresentedCharacter, readCharacterControllers, readTokenControllers } from "./token_records.ts";

// "all" in a controlled by list means every player in the game (FF45).
const everyPlayer = "all";

export function findRangeAttribute(environment: ModEnvironment, characterId: string): ModObject | undefined {
  const [attribute] = environment.findObjs({
    _type: "attribute",
    _characterid: characterId,
    name: rangeProfileAttributeName,
  });
  return attribute;
}

export function createModRangeProfileSource(environment: ModEnvironment): RangeProfileSource {
  return {
    readRangeProfile: (tokenId) => {
      const token = environment.getObj("graphic", tokenId);
      const character = token === undefined ? undefined : findRepresentedCharacter(environment, token);
      const attribute = character === undefined ? undefined : findRangeAttribute(environment, character.id);
      return readRangeProfileValue(attribute?.get("current"));
    },
  };
}

function includesPlayer(controllers: readonly string[], playerId: string): boolean {
  return controllers.includes(playerId) || controllers.includes(everyPlayer);
}

export function createModActorAuthority(environment: ModEnvironment): ActorAuthority {
  return {
    mayActFor: (actorId, tokenId) => includesPlayer(readTokenControllers(environment, tokenId), actorId),
    isGameMaster: (actorId) => environment.playerIsGM(actorId),
  };
}

export function mayControlCharacter(environment: ModEnvironment, actorId: string, characterId: string): boolean {
  return (
    environment.playerIsGM(actorId) || includesPlayer(readCharacterControllers(environment, characterId) ?? [], actorId)
  );
}
