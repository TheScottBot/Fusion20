import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildFailingRoll, buildQualifyingRoll } from "../testing/index.ts";
import { nominatePartner, qualifyingPartnerNominates, selectChainTarget } from "./fusion_chain.ts";
import {
  applyChainTransition,
  createFusionChainRegistry,
  endAllChains,
  routeAttackRoll,
  type FusionChainRegistry,
  type RollRoutingRules,
} from "./fusion_chain_registry.ts";

function sequentialRoutingRules(): RollRoutingRules {
  let nextChainNumber = 0;
  return {
    createChainId: () => {
      nextChainNumber += 1;
      return `chain ${String(nextChainNumber)}`;
    },
    chooseNextNominator: qualifyingPartnerNominates,
  };
}

const routingRules = sequentialRoutingRules();

function startChain(registry: FusionChainRegistry, rollerReference: string, rules: RollRoutingRules): string {
  const routing = routeAttackRoll(registry, buildQualifyingRoll(rollerReference), rules);
  const startedEvent = routing.events.find((chainEvent) => chainEvent.kind === "chain started");
  if (startedEvent === undefined) {
    throw new Error("Expected a chain to start");
  }
  return startedEvent.chainId;
}

function advance(registry: FusionChainRegistry, chainId: string, target: string, partner: string): FusionChainRegistry {
  const withTarget = applyChainTransition(registry, chainId, (chain) => selectChainTarget(chain, target));
  return applyChainTransition(withTarget.registry, chainId, (chain) => nominatePartner(chain, partner)).registry;
}

describe("routeAttackRoll", () => {
  it("starts a chain for a qualifying roll from anyone not pending", () => {
    const routing = routeAttackRoll(
      createFusionChainRegistry(),
      buildQualifyingRoll("roller"),
      sequentialRoutingRules(),
    );
    expect(routing.registry.activeChains.size).toBe(1);
    expect(routing.events).toMatchObject([{ kind: "chain started", originalRoller: "roller" }]);
  });

  it("ignores a non qualifying roll from anyone not pending", () => {
    const registry = createFusionChainRegistry();
    const routing = routeAttackRoll(registry, buildFailingRoll("roller"), routingRules);
    expect(routing.events).toEqual([]);
    expect(routing.registry).toBe(registry);
  });

  it("spends no chain id on a roll that starts nothing", () => {
    let chainIdsCreated = 0;
    const rules: RollRoutingRules = {
      createChainId: () => {
        chainIdsCreated += 1;
        return "unused chain";
      },
      chooseNextNominator: qualifyingPartnerNominates,
    };
    routeAttackRoll(createFusionChainRegistry(), buildFailingRoll("roller"), rules);
    expect(chainIdsCreated).toBe(0);
  });

  it("routes a pending partner's critical to their chain rather than starting another", () => {
    const rules = sequentialRoutingRules();
    const empty = createFusionChainRegistry();
    const chainId = startChain(empty, "roller", rules);
    const started = routeAttackRoll(empty, buildQualifyingRoll("roller"), { ...rules, createChainId: () => chainId });
    const nominated = advance(started.registry, chainId, "target", "partner");
    const routing = routeAttackRoll(nominated, buildQualifyingRoll("partner"), rules);
    expect(routing.registry.activeChains.size).toBe(1);
    expect(routing.events).toMatchObject([{ kind: "partner attack qualified", chainId }]);
  });

  it("removes a chain from the active set when the pending partner's attack fails", () => {
    const rules = sequentialRoutingRules();
    const routing = routeAttackRoll(createFusionChainRegistry(), buildQualifyingRoll("roller"), {
      ...rules,
      createChainId: () => "only chain",
    });
    const nominated = advance(routing.registry, "only chain", "target", "partner");
    const afterMiss = routeAttackRoll(nominated, buildFailingRoll("partner"), rules);
    expect(afterMiss.registry.activeChains.size).toBe(0);
    expect(afterMiss.events).toMatchObject([{ kind: "chain ended", origin: "partner attack" }]);
  });

  it("starts a new chain for a critical from someone in another chain who is not pending, under FD8", () => {
    const rules = sequentialRoutingRules();
    const first = routeAttackRoll(createFusionChainRegistry(), buildQualifyingRoll("roller"), rules);
    const second = routeAttackRoll(first.registry, buildQualifyingRoll("roller"), rules);
    expect(second.registry.activeChains.size).toBe(2);
  });

  it("gives one roll to the oldest chain when a combatant is pending in two", () => {
    const rules = sequentialRoutingRules();
    const firstStart = routeAttackRoll(createFusionChainRegistry(), buildQualifyingRoll("first roller"), rules);
    const secondStart = routeAttackRoll(firstStart.registry, buildQualifyingRoll("second roller"), rules);
    const firstNominated = advance(secondStart.registry, "chain 1", "target", "shared partner");
    const bothNominated = advance(firstNominated, "chain 2", "target", "shared partner");
    const routing = routeAttackRoll(bothNominated, buildFailingRoll("shared partner"), rules);
    expect(routing.events).toMatchObject([{ kind: "chain ended", chainId: "chain 1" }]);
    expect(routing.registry.activeChains.get("chain 2")).toMatchObject({ stage: "awaiting partner attack" });
  });
});

describe("concurrent chains", () => {
  it("stay independent, so ending one leaves the other untouched", () => {
    const rules = sequentialRoutingRules();
    const firstStart = routeAttackRoll(createFusionChainRegistry(), buildQualifyingRoll("first roller"), rules);
    const secondStart = routeAttackRoll(firstStart.registry, buildQualifyingRoll("second roller"), rules);
    const secondChain = secondStart.registry.activeChains.get("chain 2");
    const missed = applyChainTransition(secondStart.registry, "chain 1", (chain) => selectChainTarget(chain, "target"));
    expect(missed.registry.activeChains.get("chain 2")).toBe(secondChain);
  });
});

describe("applyChainTransition", () => {
  it("rejects a transition for a chain that is not active", () => {
    const registry = createFusionChainRegistry();
    const application = applyChainTransition(registry, "missing chain", (chain) => selectChainTarget(chain, "target"));
    expect(application).toMatchObject({ rejection: "unknown chain", events: [], registry });
  });

  it("passes a chain's own rejection back unchanged, and changes nothing", () => {
    const rules = sequentialRoutingRules();
    const started = routeAttackRoll(createFusionChainRegistry(), buildQualifyingRoll("roller"), rules);
    const application = applyChainTransition(started.registry, "chain 1", (chain) => nominatePartner(chain, "partner"));
    expect(application).toMatchObject({ rejection: "wrong stage", events: [] });
    expect(application.registry).toBe(started.registry);
  });
});

describe("endAllChains", () => {
  it("ends every active chain with one origin, which is how a turn advance ends them", () => {
    const rules = sequentialRoutingRules();
    const firstStart = routeAttackRoll(createFusionChainRegistry(), buildQualifyingRoll("first roller"), rules);
    const secondStart = routeAttackRoll(firstStart.registry, buildQualifyingRoll("second roller"), rules);
    const ending = endAllChains(secondStart.registry, "turn order");
    expect(ending.registry.activeChains.size).toBe(0);
    expect(ending.events).toMatchObject([
      { kind: "chain ended", chainId: "chain 1", origin: "turn order" },
      { kind: "chain ended", chainId: "chain 2", origin: "turn order" },
    ]);
  });

  it("does nothing when no chain is active", () => {
    expect(endAllChains(createFusionChainRegistry(), "turn order").events).toEqual([]);
  });
});

describe("property: nominations", () => {
  const combatantPool = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

  it("never lets one participant be nominated twice in a chain, whatever is attempted", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...combatantPool), { maxLength: 30 }),
        fc.boolean(),
        (nominations, attacksQualify) => {
          const rules = sequentialRoutingRules();
          const started = routeAttackRoll(createFusionChainRegistry(), buildQualifyingRoll("alpha"), rules);
          let registry = applyChainTransition(started.registry, "chain 1", (chain) => {
            return selectChainTarget(chain, "target");
          }).registry;
          const participantsSeen = new Set<string>(["alpha"]);
          for (const nomination of nominations) {
            const application = applyChainTransition(registry, "chain 1", (chain) =>
              nominatePartner(chain, nomination),
            );
            if (application.rejection === undefined) {
              expect(participantsSeen.has(nomination)).toBe(false);
              participantsSeen.add(nomination);
              const buildRoll = attacksQualify ? buildQualifyingRoll : buildFailingRoll;
              registry = routeAttackRoll(application.registry, buildRoll(nomination), rules).registry;
            }
            const chain = registry.activeChains.get("chain 1");
            if (chain !== undefined) {
              expect(new Set(chain.participants).size).toBe(chain.participants.length);
            }
          }
        },
      ),
    );
  });
});
