import { rangeRefusalText, rangeSetText } from "@fusion20/shared/application";
import { rangeProfileAttributeName } from "@fusion20/shared/protocol";
import { escapeChatText, whisperTargetForPlayer, whisperTo } from "./chat_output.ts";
import { findRangeAttribute, mayControlCharacter } from "./character_records.ts";
import type { ModEnvironment } from "./mod_environment.ts";
import { readTrimmedText } from "./token_records.ts";

export type RangeCommandOutcome = "set" | keyof typeof rangeRefusalText;

export interface RangeRequest {
  readonly character: string;
  readonly value: string;
}

// FD4: a player sets their own character's range by command, as an alternative to the sheet.
// The value was checked against the grammar when the command was parsed.
export function applyRangeCommand(
  environment: ModEnvironment,
  actorId: string,
  { character: characterId, value }: RangeRequest,
): RangeCommandOutcome {
  const character = environment.getObj("character", characterId);
  let outcome: RangeCommandOutcome = "unknown character";
  if (character !== undefined) {
    outcome = mayControlCharacter(environment, actorId, characterId) ? "set" : "not authorised";
  }
  if (character !== undefined && outcome === "set") {
    const attribute = findRangeAttribute(environment, characterId);
    if (attribute === undefined) {
      environment.createObj("attribute", { characterid: characterId, name: rangeProfileAttributeName, current: value });
    } else {
      attribute.set({ current: value });
    }
  }
  const replyText =
    outcome === "set" ? rangeSetText(readTrimmedText(character?.get("name")), value) : rangeRefusalText[outcome];
  whisperTo(environment, whisperTargetForPlayer(environment, actorId), escapeChatText(replyText));
  return outcome;
}
