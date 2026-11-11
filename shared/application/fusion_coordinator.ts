import { qualifiesForFusionCritical, type CombatantReference } from "../domain/attack_roll.ts";
import {
  endFusionChain,
  nominatePartner,
  selectChainTarget,
  type ChainEndOrigin,
  type ChainEvent,
  type ChainId,
  type FusionChain,
  type NextNominatorRule,
} from "../domain/fusion_chain.ts";
import * as chainRegistry from "../domain/fusion_chain_registry.ts";
import { assessFusionPartners, hasEligiblePartner, type PartnerAssessment } from "../domain/partner_eligibility.ts";
import { encodeChainMessage, parseChainMessage } from "../protocol/chain_message_table.ts";
import { parseCommand, type ChatCommand } from "../protocol/command_table.ts";
import { describeChainEvent } from "./display_strings.ts";
import type {
  AttackObservation,
  BattlefieldSnapshot,
  ChainCommand,
  CoordinatorMode,
  FusionCoordinatorPorts,
  Unsubscribe,
} from "./ports.ts";

export interface FusionCoordinatorOptions {
  readonly mode: CoordinatorMode;
  readonly createChainId: () => ChainId;
  readonly chooseNextNominator: NextNominatorRule;
}

// Section 7 of the specification: the counters live here, so both products report alike.
export interface CoordinatorCounters {
  readonly rollsObserved: number;
  readonly rollsUnreadable: Readonly<Record<string, number>>;
  readonly duplicatesIgnored: number;
  readonly qualifyingCriticals: number;
  readonly chainsStarted: number;
  readonly chainsEnded: Readonly<Record<string, number>>;
  readonly nominations: number;
  readonly partnerIneligibility: Readonly<Record<string, number>>;
  readonly refusedCommands: Readonly<Record<string, number>>;
  readonly adapterFailures: Readonly<Record<string, number>>;
  readonly chainMessagesRefused: Readonly<Record<string, number>>;
}

export interface FollowedChain {
  readonly chainId: ChainId;
  readonly participants: readonly CombatantReference[];
  readonly target: CombatantReference | undefined;
}

export interface FusionCoordinator {
  readonly start: () => void;
  readonly stop: () => void;
  readonly readCounters: () => CoordinatorCounters;
  readonly readFollowedChains: () => ReadonlyMap<ChainId, FollowedChain>;
}

// Two tabs posting one roll arrive well inside a second. Three leaves room for a slow network
// without swallowing a genuine second attack, which takes far longer to make (FF28).
const duplicateWindowMilliseconds = 3000;

type CountedKey = Exclude<
  keyof CoordinatorCounters,
  "rollsObserved" | "duplicatesIgnored" | "qualifyingCriticals" | "chainsStarted" | "nominations"
>;

export function createFusionCoordinator(
  ports: FusionCoordinatorPorts,
  options: FusionCoordinatorOptions,
): FusionCoordinator {
  let registry: chainRegistry.FusionChainRegistry = chainRegistry.createFusionChainRegistry();
  const ownChainIds = new Set<ChainId>();
  const followedChains = new Map<ChainId, FollowedChain>();
  const recentRolls = new Map<string, number>();
  const unsubscribers: Unsubscribe[] = [];
  const counters = {
    rollsObserved: 0,
    duplicatesIgnored: 0,
    qualifyingCriticals: 0,
    chainsStarted: 0,
    nominations: 0,
    rollsUnreadable: {} as Record<string, number>,
    chainsEnded: {} as Record<string, number>,
    partnerIneligibility: {} as Record<string, number>,
    refusedCommands: {} as Record<string, number>,
    adapterFailures: {} as Record<string, number>,
    chainMessagesRefused: {} as Record<string, number>,
  };

  const createChainId = (): ChainId => {
    const chainId = options.createChainId();
    ownChainIds.add(chainId);
    return chainId;
  };
  const rollRoutingRules = { createChainId, chooseNextNominator: options.chooseNextNominator };

  function count(counterName: CountedKey, category: string): void {
    const tally = counters[counterName];
    tally[category] = (tally[category] ?? 0) + 1;
  }

  function refuseCommand(reason: string): void {
    count("refusedCommands", reason);
    ports.diagnostics.report({ kind: "refused command", reason });
  }

  function readSnapshot(): BattlefieldSnapshot | undefined {
    const reading = ports.battlefield.readBattlefield();
    if (reading.outcome === "unavailable") {
      count("adapterFailures", "battlefield");
      ports.diagnostics.report({ kind: "adapter failure", port: "battlefield", reason: reading.reason });
      return undefined;
    }
    return reading.snapshot;
  }

  function nameLookup(): (reference: CombatantReference) => string {
    const reading = ports.battlefield.readBattlefield();
    const combatants = reading.outcome === "read" ? reading.snapshot.combatants : [];
    return (reference) => combatants.find((combatant) => combatant.reference === reference)?.displayName ?? reference;
  }

  function assessPartners(
    chain: FusionChain,
    snapshot: BattlefieldSnapshot,
    target: CombatantReference,
  ): readonly PartnerAssessment[] | undefined {
    const targetCombatant = snapshot.combatants.find((combatant) => combatant.reference === target);
    if (targetCombatant === undefined) {
      return undefined;
    }
    return assessFusionPartners({
      candidates: snapshot.combatants.map((combatant) => ({
        reference: combatant.reference,
        isAlly: combatant.isAlly,
        footprint: combatant.footprint,
        rangeProfile: ports.rangeProfiles.readRangeProfile(combatant.reference),
        viewer: combatant.viewer,
      })),
      participants: chain.participants,
      target: { reference: target, footprint: targetCombatant.footprint, sightTarget: targetCombatant.sightTarget },
      grid: snapshot.grid,
      scene: snapshot.scene,
    });
  }

  // Re-evaluated against the current battlefield at every nomination, never cached (FR6).
  function offerPartners(chainId: ChainId): void {
    const chain = registry.activeChains.get(chainId);
    if (chain?.stage !== "awaiting nomination") {
      return;
    }
    const snapshot = readSnapshot();
    if (snapshot === undefined) {
      return;
    }
    const assessments = assessPartners(chain, snapshot, chain.target);
    if (assessments === undefined) {
      count("adapterFailures", "battlefield");
      ports.diagnostics.report({ kind: "adapter failure", port: "battlefield", reason: "target not on page" });
      return;
    }
    for (const reason of assessments.flatMap((assessment) => assessment.reasons)) {
      count("partnerIneligibility", reason);
    }
    if (!hasEligiblePartner(assessments)) {
      commitChange(
        chainRegistry.applyChainTransition(registry, chainId, (openChain) =>
          endFusionChain(openChain, "no eligible partner"),
        ),
      );
      return;
    }
    ports.prompter.presentPartners({ chainId, nominator: chain.nominator, target: chain.target, assessments });
  }

  function reactToEvent(chainEvent: ChainEvent): void {
    ports.announcer.announce(encodeChainMessage(chainEvent, describeChainEvent(chainEvent, nameLookup())));
    switch (chainEvent.kind) {
      case "chain started":
        counters.chainsStarted += 1;
        ports.prompter.promptForTarget({ chainId: chainEvent.chainId, nominator: chainEvent.originalRoller });
        return;
      case "target selected":
      case "partner attack qualified":
        offerPartners(chainEvent.chainId);
        return;
      case "partner nominated":
        counters.nominations += 1;
        return;
      case "chain ended":
        count("chainsEnded", chainEvent.origin);
        return;
    }
  }

  function commitChange(change: chainRegistry.RegistryChange): void {
    registry = change.registry;
    for (const chainEvent of change.events) {
      reactToEvent(chainEvent);
    }
  }

  function isDuplicate(duplicateKey: string): boolean {
    const now = ports.clock.nowInMilliseconds();
    for (const [key, seenAt] of recentRolls) {
      if (now - seenAt > duplicateWindowMilliseconds) {
        recentRolls.delete(key);
      }
    }
    if (recentRolls.has(duplicateKey)) {
      return true;
    }
    recentRolls.set(duplicateKey, now);
    return false;
  }

  function observeAttack(observation: AttackObservation): void {
    counters.rollsObserved += 1;
    if (observation.outcome === "unreadable") {
      count("rollsUnreadable", observation.reason);
      return;
    }
    if (observation.outcome === "ignored") {
      return;
    }
    if (isDuplicate(observation.duplicateKey)) {
      counters.duplicatesIgnored += 1;
      return;
    }
    if (qualifiesForFusionCritical(observation.attackRoll)) {
      counters.qualifyingCriticals += 1;
    }
    commitChange(chainRegistry.routeAttackRoll(registry, observation.attackRoll, rollRoutingRules));
  }

  // The nominator acts, or the GM for them. While a partner's attack is pending there is no
  // nominator, so the original roller may still end the chain.
  function actingCombatant(chain: FusionChain): CombatantReference {
    return chain.stage === "awaiting target" || chain.stage === "awaiting nomination"
      ? chain.nominator
      : chain.originalRoller;
  }

  function mayAct(actorId: string, chain: FusionChain): boolean {
    return ports.authority.isGameMaster(actorId) || ports.authority.mayActFor(actorId, actingCombatant(chain));
  }

  function selectTarget(actorId: string, chain: FusionChain, target: CombatantReference): void {
    if (!mayAct(actorId, chain)) {
      refuseCommand("not authorised");
      return;
    }
    const snapshot = readSnapshot();
    if (snapshot === undefined) {
      return;
    }
    if (!snapshot.combatants.some((combatant) => combatant.reference === target)) {
      refuseCommand("unknown target");
      return;
    }
    // FD16: any token except the nominator, and light tokens never reach the snapshot (FF46).
    if (chain.stage !== "awaiting target" || target === chain.nominator) {
      refuseCommand(chain.stage === "awaiting target" ? "invalid target" : "wrong stage");
      return;
    }
    commitChange(
      chainRegistry.applyChainTransition(registry, chain.chainId, (openChain) => selectChainTarget(openChain, target)),
    );
  }

  function nominate(actorId: string, chain: FusionChain, partner: CombatantReference): void {
    if (!mayAct(actorId, chain)) {
      refuseCommand("not authorised");
      return;
    }
    if (chain.stage !== "awaiting nomination") {
      refuseCommand("wrong stage");
      return;
    }
    const snapshot = readSnapshot();
    if (snapshot === undefined) {
      return;
    }
    const assessments = assessPartners(chain, snapshot, chain.target) ?? [];
    const isEligible = assessments.some((assessment) => assessment.reference === partner && assessment.isEligible);
    if (!isEligible) {
      refuseCommand("partner not eligible");
      return;
    }
    commitChange(
      chainRegistry.applyChainTransition(registry, chain.chainId, (openChain) => nominatePartner(openChain, partner)),
    );
  }

  function endChain(actorId: string, chain: FusionChain): void {
    if (!mayAct(actorId, chain)) {
      refuseCommand("not authorised");
      return;
    }
    // Recorded as a required field, so every end says which surface acted (datum 0.14).
    const origin: ChainEndOrigin = ports.authority.mayActFor(actorId, actingCombatant(chain))
      ? "nominator"
      : "game master";
    commitChange(
      chainRegistry.applyChainTransition(registry, chain.chainId, (openChain) => endFusionChain(openChain, origin)),
    );
  }

  function chainOf(command: ChatCommand): FusionChain | undefined {
    return "chain" in command ? registry.activeChains.get(command.chain) : undefined;
  }

  function observeCommand(chainCommand: ChainCommand): void {
    const parsing = parseCommand(chainCommand.commandText);
    if (parsing.outcome === "refused") {
      refuseCommand("malformed command");
      return;
    }
    const { command } = parsing;
    // Setting a range writes to a character, and picking a roller's token finishes reading a
    // roll. Both belong to the product before a roll or command reaches here (FE9).
    if (command.verb === "range" || command.verb === "roller") {
      refuseCommand("unsupported command");
      return;
    }
    const chain = chainOf(command);
    if (chain === undefined) {
      refuseCommand("unknown chain");
      return;
    }
    if (command.verb === "target") {
      selectTarget(chainCommand.actorId, chain, command.token);
    } else if (command.verb === "nominate") {
      nominate(chainCommand.actorId, chain, command.partner);
    } else {
      endChain(chainCommand.actorId, chain);
    }
  }

  function followChainEvent(chainEvent: ChainEvent): void {
    const followed = followedChains.get(chainEvent.chainId);
    switch (chainEvent.kind) {
      case "chain started":
        followedChains.set(chainEvent.chainId, {
          chainId: chainEvent.chainId,
          participants: [chainEvent.originalRoller],
          target: undefined,
        });
        return;
      case "target selected":
        if (followed !== undefined) {
          followedChains.set(chainEvent.chainId, { ...followed, target: chainEvent.target });
        }
        return;
      case "partner nominated":
        if (followed !== undefined) {
          followedChains.set(chainEvent.chainId, {
            ...followed,
            participants: [...followed.participants, chainEvent.partner],
          });
        }
        return;
      case "partner attack qualified":
        return;
      case "chain ended":
        followedChains.delete(chainEvent.chainId);
        return;
    }
  }

  // A follower shows chains and never prompts (FD11). A leader also follows chains it did not
  // start, and skips the echo of its own announcements, which chat sends back to it (FF20).
  function observeChainMessage(messageText: string): void {
    const parsing = parseChainMessage(messageText);
    if (parsing.outcome === "refused") {
      if (parsing.reason !== "not a chain message") {
        count("chainMessagesRefused", parsing.reason);
      }
      return;
    }
    if (ownChainIds.has(parsing.chainEvent.chainId)) {
      return;
    }
    followChainEvent(parsing.chainEvent);
  }

  function observeTurnAdvance(): void {
    commitChange(chainRegistry.endAllChains(registry, "turn order"));
  }

  function reportStartup(): void {
    const reading = ports.battlefield.readBattlefield();
    const lighting =
      reading.outcome === "unavailable" ? "unavailable" : reading.snapshot.scene.lightingEnabled ? "on" : "off";
    // Chains live in memory only, so a start means any chain from before it has ended (FF22).
    ports.diagnostics.report({ kind: "startup", mode: options.mode, lighting });
  }

  return {
    start: () => {
      reportStartup();
      unsubscribers.push(ports.chainMessages.subscribe(observeChainMessage));
      if (options.mode === "leader") {
        unsubscribers.push(ports.attackRolls.subscribe(observeAttack));
        unsubscribers.push(ports.commands.subscribe(observeCommand));
        unsubscribers.push(ports.turnOrder.subscribe(observeTurnAdvance));
      }
    },
    stop: () => {
      for (const unsubscribe of unsubscribers.splice(0)) {
        unsubscribe();
      }
    },
    readCounters: () => structuredClone(counters),
    readFollowedChains: () => new Map(followedChains),
  };
}
