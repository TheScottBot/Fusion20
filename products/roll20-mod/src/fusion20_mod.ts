import { createFusionCoordinator, type DiagnosticsSink, type FusionCoordinator } from "@fusion20/shared/application";
import { qualifyingPartnerNominates } from "@fusion20/shared/domain";
import { parseCommand, readRangeProfileValue } from "@fusion20/shared/protocol";
import { readPlayerList } from "@fusion20/shared/roll20";
import { createModBattlefieldSource } from "./battlefield_source.ts";
import { createModAnnouncer, createModPrompter } from "./chat_output.ts";
import { createModAttackRollSource, createModCommandSource } from "./chat_sources.ts";
import { createModActorAuthority, createModRangeProfileSource, findRangeAttribute } from "./character_records.ts";
import { createListenerFanOut, type ListenerFanOut } from "./listener_fan_out.ts";
import type { ModEnvironment, ModObject } from "./mod_environment.ts";
import { applyRangeCommand } from "./range_command.ts";
import { createModTurnOrderSource, type TurnOrderChange } from "./turn_order_source.ts";

export const modVersion = "0.0.0";

export interface Fusion20ModConfiguration {
  // FD3: the status marker a GM puts on allied non player characters, if one is configured.
  readonly allyMarker: string | undefined;
}

export function createModDiagnostics(environment: ModEnvironment): DiagnosticsSink {
  return {
    report: (line) => {
      environment.log(`Fusion20 ${JSON.stringify(line)}`);
    },
  };
}

// Section 7 states absent subsystems at start: lighting off per page, no ally marker, and player
// characters with no range. Counts only, so no game content reaches the log.
function reportModStartup(environment: ModEnvironment, configuration: Fusion20ModConfiguration): void {
  const pages = environment.findObjs({ _type: "page" }).map((page) => ({
    page: page.id,
    lighting: page.get("dynamic_lighting_enabled") === true ? "on" : "off",
  }));
  const playerCharacters = environment
    .findObjs({ _type: "character" })
    .filter((character) => readPlayerList(character.get("controlledby")).length > 0);
  const charactersWithoutRange = playerCharacters.filter((character) => {
    return readRangeProfileValue(findRangeAttribute(environment, character.id)?.get("current")).status !== "present";
  });
  environment.log(
    `Fusion20 ${JSON.stringify({
      kind: "mod startup",
      version: modVersion,
      pages,
      allyMarker: configuration.allyMarker ?? "none",
      playerCharacters: playerCharacters.length,
      playerCharactersWithoutRange: charactersWithoutRange.length,
    })}`,
  );
}

function wireRangeCommands(environment: ModEnvironment, chatMessages: ListenerFanOut<unknown>): void {
  createModCommandSource(chatMessages, "range").subscribe(({ actorId, commandText }) => {
    const parsing = parseCommand(commandText);
    if (parsing.outcome === "parsed" && parsing.command.verb === "range") {
      applyRangeCommand(environment, actorId, parsing.command);
    }
  });
}

// Chain ids carry the start time, so a chain from before a restart is never mistaken for a new
// one by a follower reading old chat (FF22).
function createChainIdFactory(environment: ModEnvironment): () => string {
  const runStamp = environment.now().toString(36);
  let chainNumber = 0;
  return () => {
    chainNumber += 1;
    return `${runStamp}-${String(chainNumber)}`;
  };
}

// The composition root. Everything starts on ready, after Roll20 has loaded the campaign, and
// chains live in memory only, so a restart begins with none (FF22).
export function installFusion20Mod(
  environment: ModEnvironment,
  configuration: Fusion20ModConfiguration,
): { readonly readCoordinator: () => FusionCoordinator | undefined } {
  let coordinator: FusionCoordinator | undefined;
  environment.on("ready", () => {
    const diagnostics = createModDiagnostics(environment);
    const reportFailureOf = (port: string) => (reason: string) => {
      diagnostics.report({ kind: "adapter failure", port, reason });
    };
    const chatMessages = createListenerFanOut<unknown>(reportFailureOf("chat message"));
    const turnOrderChanges = createListenerFanOut<TurnOrderChange>(reportFailureOf("turn order"));
    environment.on("chat:message", (message) => {
      chatMessages.deliver(message);
    });
    environment.on("change:campaign:turnorder", (campaign, previous) => {
      turnOrderChanges.deliver({ campaign: campaign as ModObject, previous });
    });
    reportModStartup(environment, configuration);
    coordinator = createFusionCoordinator(
      {
        attackRolls: createModAttackRollSource(environment, chatMessages),
        // The Mod leads every chain in its game, so it follows no one (FD11).
        chainMessages: { subscribe: () => () => undefined },
        commands: createModCommandSource(chatMessages, "chain"),
        turnOrder: createModTurnOrderSource(turnOrderChanges),
        battlefield: createModBattlefieldSource(environment, configuration.allyMarker),
        rangeProfiles: createModRangeProfileSource(environment),
        authority: createModActorAuthority(environment),
        prompter: createModPrompter(environment),
        announcer: createModAnnouncer(environment),
        diagnostics,
        clock: { nowInMilliseconds: environment.now },
      },
      {
        mode: "leader",
        createChainId: createChainIdFactory(environment),
        chooseNextNominator: qualifyingPartnerNominates,
      },
    );
    coordinator.start();
    wireRangeCommands(environment, chatMessages);
  });
  return { readCoordinator: () => coordinator };
}
