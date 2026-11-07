import { describe, expect, it } from "vitest";
import { buildAttackRoll, buildFailingRoll, buildQualifyingRoll } from "../testing/index.ts";
import {
  endFusionChain,
  nominatePartner,
  qualifyingPartnerNominates,
  resolvePartnerAttack,
  selectChainTarget,
  startFusionChain,
  type ChainTransition,
  type EndableChainOrigin,
  type FusionChain,
} from "./fusion_chain.ts";

const originalRoller = "original roller";
const firstPartner = "first partner";
const secondPartner = "second partner";
const targetToken = "target token";

function appliedChain(transition: ChainTransition): FusionChain {
  if (transition.outcome === "rejected") {
    throw new Error(`Expected the transition to apply: ${transition.rejection}`);
  }
  return transition.chain;
}

function chainAwaitingTarget(): FusionChain {
  return appliedChain(startFusionChain("chain one", buildQualifyingRoll(originalRoller)));
}

function chainAwaitingNomination(): FusionChain {
  return appliedChain(selectChainTarget(chainAwaitingTarget(), targetToken));
}

function chainAwaitingPartnerAttack(): FusionChain {
  return appliedChain(nominatePartner(chainAwaitingNomination(), firstPartner));
}

function endedChain(): FusionChain {
  return appliedChain(endFusionChain(chainAwaitingNomination(), "game master"));
}

function partnerAttack(chain: FusionChain, attackRoll = buildQualifyingRoll(firstPartner)): ChainTransition {
  return resolvePartnerAttack(chain, attackRoll, qualifyingPartnerNominates);
}

describe("startFusionChain", () => {
  it("starts awaiting a target, with the roller as the only participant and the nominator", () => {
    const transition = startFusionChain("chain one", buildQualifyingRoll(originalRoller));
    expect(transition).toMatchObject({
      outcome: "applied",
      chain: { stage: "awaiting target", nominator: originalRoller, participants: [originalRoller] },
      events: [{ kind: "chain started", chainId: "chain one", originalRoller }],
    });
  });

  it("rejects a roll that does not qualify", () => {
    expect(startFusionChain("chain one", buildFailingRoll(originalRoller))).toEqual({
      outcome: "rejected",
      rejection: "attack does not qualify",
    });
  });
});

describe("selectChainTarget", () => {
  it("moves to awaiting a nomination and announces the target", () => {
    expect(selectChainTarget(chainAwaitingTarget(), targetToken)).toMatchObject({
      outcome: "applied",
      chain: { stage: "awaiting nomination", target: targetToken, nominator: originalRoller },
      events: [{ kind: "target selected", target: targetToken }],
    });
  });

  it.each([
    ["awaiting a nomination", chainAwaitingNomination],
    ["awaiting a partner's attack", chainAwaitingPartnerAttack],
    ["ended", endedChain],
  ])("rejects a target while %s", (_stageName, buildChain) => {
    expect(selectChainTarget(buildChain(), targetToken)).toEqual({ outcome: "rejected", rejection: "wrong stage" });
  });
});

describe("nominatePartner", () => {
  it("grows the participants by one and awaits that partner's attack", () => {
    expect(nominatePartner(chainAwaitingNomination(), firstPartner)).toMatchObject({
      outcome: "applied",
      chain: {
        stage: "awaiting partner attack",
        pendingPartner: firstPartner,
        participants: [originalRoller, firstPartner],
      },
      events: [{ kind: "partner nominated", nominator: originalRoller, partner: firstPartner, target: targetToken }],
    });
  });

  it("rejects nominating the original roller", () => {
    expect(nominatePartner(chainAwaitingNomination(), originalRoller)).toEqual({
      outcome: "rejected",
      rejection: "already a participant",
    });
  });

  it("rejects nominating a partner who has already taken part", () => {
    const chain = appliedChain(partnerAttack(chainAwaitingPartnerAttack()));
    expect(nominatePartner(chain, firstPartner)).toEqual({ outcome: "rejected", rejection: "already a participant" });
  });

  it.each([
    ["awaiting a target", chainAwaitingTarget],
    ["awaiting a partner's attack", chainAwaitingPartnerAttack],
    ["ended", endedChain],
  ])("rejects a nomination while %s", (_stageName, buildChain) => {
    expect(nominatePartner(buildChain(), secondPartner)).toEqual({ outcome: "rejected", rejection: "wrong stage" });
  });
});

describe("resolvePartnerAttack", () => {
  it("passes the nomination to the partner when their attack qualifies, as FR3 says", () => {
    expect(partnerAttack(chainAwaitingPartnerAttack())).toMatchObject({
      outcome: "applied",
      chain: { stage: "awaiting nomination", nominator: firstPartner, target: targetToken },
      events: [{ kind: "partner attack qualified", partner: firstPartner, nextNominator: firstPartner }],
    });
  });

  it("keeps the same target for the next nomination", () => {
    const chain = appliedChain(partnerAttack(chainAwaitingPartnerAttack()));
    expect(chain).toMatchObject({ target: targetToken });
  });

  it("uses an injected nominator rule, which is how the extension departs from FR3 under FD20", () => {
    const transition = resolvePartnerAttack(
      chainAwaitingPartnerAttack(),
      buildQualifyingRoll(firstPartner),
      ({ originalRoller: chainOriginalRoller }) => chainOriginalRoller,
    );
    expect(transition).toMatchObject({ outcome: "applied", chain: { nominator: originalRoller } });
  });

  it("ends the chain with origin partner attack when the attack does not qualify", () => {
    expect(partnerAttack(chainAwaitingPartnerAttack(), buildFailingRoll(firstPartner))).toMatchObject({
      outcome: "applied",
      chain: { stage: "ended", endOrigin: "partner attack" },
      events: [{ kind: "chain ended", origin: "partner attack", reason: "partner attack did not qualify" }],
    });
  });

  it("rejects a roll from anyone but the pending partner", () => {
    expect(partnerAttack(chainAwaitingPartnerAttack(), buildQualifyingRoll(secondPartner))).toEqual({
      outcome: "rejected",
      rejection: "roller is not the pending partner",
    });
  });

  it("uses the kept die and threshold of the partner's own roll", () => {
    const champion = buildAttackRoll({ rollerReference: firstPartner, keptNaturalD20: 19, criticalThreshold: 19 });
    expect(partnerAttack(chainAwaitingPartnerAttack(), champion)).toMatchObject({
      chain: { stage: "awaiting nomination" },
    });
  });

  it.each([
    ["awaiting a target", chainAwaitingTarget],
    ["awaiting a nomination", chainAwaitingNomination],
    ["ended", endedChain],
  ])("rejects a partner attack while %s", (_stageName, buildChain) => {
    expect(partnerAttack(buildChain())).toEqual({ outcome: "rejected", rejection: "wrong stage" });
  });
});

describe("endFusionChain", () => {
  const originReasons: readonly (readonly [EndableChainOrigin, string])[] = [
    ["nominator", "explicit end"],
    ["game master", "explicit end"],
    ["turn order", "turn order advanced"],
    ["sandbox restart", "sandbox restarted"],
  ];

  it.each(originReasons)("records origin %s from every open stage", (origin, reason) => {
    for (const buildChain of [chainAwaitingTarget, chainAwaitingNomination, chainAwaitingPartnerAttack]) {
      expect(endFusionChain(buildChain(), origin)).toMatchObject({
        outcome: "applied",
        chain: { stage: "ended", endOrigin: origin },
        events: [{ kind: "chain ended", origin, reason }],
      });
    }
  });

  it("records no eligible partner while awaiting a nomination", () => {
    expect(endFusionChain(chainAwaitingNomination(), "no eligible partner")).toMatchObject({
      chain: { stage: "ended", endOrigin: "no eligible partner" },
      events: [{ reason: "no eligible partner" }],
    });
  });

  it.each([
    ["awaiting a target", chainAwaitingTarget],
    ["awaiting a partner's attack", chainAwaitingPartnerAttack],
  ])("rejects no eligible partner while %s, when no assessment applies", (_stageName, buildChain) => {
    expect(endFusionChain(buildChain(), "no eligible partner")).toEqual({
      outcome: "rejected",
      rejection: "wrong stage",
    });
  });

  it("rejects ending a chain that has already ended, so one end is recorded once", () => {
    expect(endFusionChain(endedChain(), "game master")).toEqual({ outcome: "rejected", rejection: "wrong stage" });
  });
});

describe("a chain with several partners", () => {
  it("has no fixed cap, as FR6 says, and grows by one per nomination", () => {
    let chain = chainAwaitingNomination();
    for (let partnerIndex = 0; partnerIndex < 40; partnerIndex += 1) {
      const partner = `partner ${String(partnerIndex)}`;
      chain = appliedChain(nominatePartner(chain, partner));
      expect(chain.participants).toHaveLength(partnerIndex + 2);
      chain = appliedChain(resolvePartnerAttack(chain, buildQualifyingRoll(partner), qualifyingPartnerNominates));
    }
    expect(chain.stage).toBe("awaiting nomination");
  });
});
