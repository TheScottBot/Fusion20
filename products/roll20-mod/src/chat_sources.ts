import type {
  AttackObservation,
  AttackRollSource,
  ChainCommand,
  ChainCommandSource,
} from "@fusion20/shared/application";
import { createAttackRoll } from "@fusion20/shared/domain";
import { parseCommand } from "@fusion20/shared/protocol";
import {
  interpretBeyond20Roll,
  isObservedChatMessage,
  readPlayerList,
  resolveRoller,
  type ObservedChatMessage,
} from "@fusion20/shared/roll20";
import type { ListenerFanOut } from "./listener_fan_out.ts";
import type { ModEnvironment } from "./mod_environment.ts";
import { readPlayerPage, readTrimmedText } from "./token_records.ts";

// Messages the Mod itself sends carry this player id. They are never a player's roll or command.
const scriptPlayerId = "API";

function readField(message: ObservedChatMessage, fieldName: string): unknown {
  // isObservedChatMessage has already checked that the message is a plain record.
  return (message as unknown as Readonly<Record<string, unknown>>)[fieldName];
}

function isFromPlayer(message: ObservedChatMessage): boolean {
  return typeof message.playerid === "string" && message.playerid !== scriptPlayerId;
}

// Same player, same post and same dice: what two tabs relaying one roll have in common (FF28).
function buildDuplicateKey(message: ObservedChatMessage): string {
  const inlineRolls: readonly unknown[] = Array.isArray(message.inlinerolls) ? message.inlinerolls : [];
  const rollTotals = inlineRolls.map((inlineRoll) => {
    const results: unknown = (inlineRoll as { results?: unknown } | null)?.results;
    return (results as { total?: unknown } | null | undefined)?.total ?? null;
  });
  return JSON.stringify([message.playerid, message.rolltemplate, message.content, rollTotals]);
}

function observeRoll(environment: ModEnvironment, message: ObservedChatMessage): AttackObservation {
  const reading = interpretBeyond20Roll(message);
  if (reading.outcome !== "attack") {
    return reading.outcome === "ignored" ? { outcome: "ignored" } : reading;
  }
  const page = readPlayerPage(environment);
  const tokensOnPage = (
    page === undefined
      ? []
      : environment.findObjs({ _type: "graphic", _subtype: "token", _pageid: page.id, layer: "objects" })
  ).map((token) => ({ id: token.id, represents: readTrimmedText(token.get("represents")) }));
  const characters = environment.findObjs({ _type: "character" }).map((character) => ({
    id: character.id,
    name: readTrimmedText(character.get("name")),
    controlledBy: readPlayerList(character.get("controlledby")),
  }));
  const resolution = resolveRoller(
    {
      characterName: reading.characterName,
      playerId: reading.playerId,
      posterIsGameMaster: environment.playerIsGM(reading.playerId),
    },
    characters,
    tokensOnPage,
  );
  // FD19 asks the poster to choose between several tokens. Until that exists the roll is
  // refused visibly rather than guessed (FF91).
  if (resolution.outcome !== "resolved") {
    return {
      outcome: "unreadable",
      reason: resolution.outcome === "choose" ? "several tokens for character" : resolution.reason,
    };
  }
  const creation = createAttackRoll({
    rollerReference: resolution.tokenId,
    keptNaturalD20: reading.keptNaturalD20,
    criticalThreshold: reading.criticalThreshold,
  });
  return creation.outcome === "created"
    ? { outcome: "attack", attackRoll: creation.attackRoll, duplicateKey: buildDuplicateKey(message) }
    : { outcome: "unreadable", reason: creation.reason };
}

// Only posts holding inline rolls are rolls, so ordinary chat does not count as observed rolls.
export function createModAttackRollSource(
  environment: ModEnvironment,
  chatMessages: ListenerFanOut<unknown>,
): AttackRollSource {
  return {
    subscribe: (listener) =>
      chatMessages.subscribe((message) => {
        if (isObservedChatMessage(message) && isFromPlayer(message) && Array.isArray(message.inlinerolls)) {
          listener(observeRoll(environment, message));
        }
      }),
  };
}

export type CommandRoute = "chain" | "range";

// Commands are routed by verb, so the Mod sets ranges itself and the coordinator sees the rest.
// Messages that are not ours at all go nowhere.
export function routeCommand(commandText: string): CommandRoute | undefined {
  const parsing = parseCommand(commandText);
  if (parsing.outcome === "refused") {
    return parsing.reason === "not a command" ? undefined : "chain";
  }
  return parsing.command.verb === "range" ? "range" : "chain";
}

export function createModCommandSource(chatMessages: ListenerFanOut<unknown>, route: CommandRoute): ChainCommandSource {
  return {
    subscribe: (listener: (command: ChainCommand) => void) =>
      chatMessages.subscribe((message) => {
        if (!isObservedChatMessage(message) || !isFromPlayer(message) || readField(message, "type") !== "api") {
          return;
        }
        const commandText = typeof message.content === "string" ? message.content : "";
        if (routeCommand(commandText) === route) {
          listener({ actorId: String(message.playerid), commandText });
        }
      }),
  };
}
