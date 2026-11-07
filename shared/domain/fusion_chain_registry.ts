import { qualifiesForFusionCritical, type AttackRoll } from "./attack_roll.ts";
import {
  endFusionChain,
  resolvePartnerAttack,
  startFusionChain,
  type ChainEvent,
  type ChainId,
  type ChainRejection,
  type ChainTransition,
  type EndableChainOrigin,
  type FusionChain,
  type NextNominatorRule,
} from "./fusion_chain.ts";

export interface FusionChainRegistry {
  // A Map keeps insertion order, which is what makes "oldest chain" below well defined.
  readonly activeChains: ReadonlyMap<ChainId, FusionChain>;
}

export interface RollRoutingRules {
  readonly createChainId: () => ChainId;
  readonly chooseNextNominator: NextNominatorRule;
}

export interface RegistryChange {
  readonly registry: FusionChainRegistry;
  readonly events: readonly ChainEvent[];
  readonly rejection: ChainRejection | "unknown chain" | undefined;
}

export function createFusionChainRegistry(): FusionChainRegistry {
  return { activeChains: new Map() };
}

function unchanged(registry: FusionChainRegistry, rejection: RegistryChange["rejection"]): RegistryChange {
  return { registry, events: [], rejection };
}

function withChain(registry: FusionChainRegistry, chain: FusionChain): FusionChainRegistry {
  const activeChains = new Map(registry.activeChains);
  if (chain.stage === "ended") {
    activeChains.delete(chain.chainId);
  } else {
    activeChains.set(chain.chainId, chain);
  }
  return { activeChains };
}

function commitTransition(registry: FusionChainRegistry, transition: ChainTransition): RegistryChange {
  if (transition.outcome === "rejected") {
    return unchanged(registry, transition.rejection);
  }
  return { registry: withChain(registry, transition.chain), events: transition.events, rejection: undefined };
}

// One roll answers one nomination, so a combatant pending in two chains resolves the oldest and
// the next chain waits for that combatant's next roll.
function findChainAwaitingRoller(registry: FusionChainRegistry, attackRoll: AttackRoll): FusionChain | undefined {
  return [...registry.activeChains.values()].find((chain) => {
    return chain.stage === "awaiting partner attack" && chain.pendingPartner === attackRoll.rollerReference;
  });
}

export function routeAttackRoll(
  registry: FusionChainRegistry,
  attackRoll: AttackRoll,
  rollRoutingRules: RollRoutingRules,
): RegistryChange {
  const awaitingChain = findChainAwaitingRoller(registry, attackRoll);
  if (awaitingChain !== undefined) {
    const transition = resolvePartnerAttack(awaitingChain, attackRoll, rollRoutingRules.chooseNextNominator);
    return commitTransition(registry, transition);
  }
  // Most rolls are not criticals and belong to no chain, which is not a fault worth reporting.
  if (!qualifiesForFusionCritical(attackRoll)) {
    return unchanged(registry, undefined);
  }
  return commitTransition(registry, startFusionChain(rollRoutingRules.createChainId(), attackRoll));
}

export function applyChainTransition(
  registry: FusionChainRegistry,
  chainId: ChainId,
  applyTransition: (chain: FusionChain) => ChainTransition,
): RegistryChange {
  const chain = registry.activeChains.get(chainId);
  return chain === undefined
    ? unchanged(registry, "unknown chain")
    : commitTransition(registry, applyTransition(chain));
}

export function endAllChains(registry: FusionChainRegistry, origin: EndableChainOrigin): RegistryChange {
  let currentRegistry = registry;
  const events: ChainEvent[] = [];
  for (const chainId of registry.activeChains.keys()) {
    const change = applyChainTransition(currentRegistry, chainId, (chain) => endFusionChain(chain, origin));
    currentRegistry = change.registry;
    events.push(...change.events);
  }
  return { registry: currentRegistry, events, rejection: undefined };
}
