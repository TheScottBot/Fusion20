import { qualifiesForFusionCritical, type AttackRoll, type CombatantReference } from "./attack_roll.ts";

export type ChainId = string;

export type EndableChainOrigin = "nominator" | "game master" | "turn order" | "sandbox restart" | "no eligible partner";

export type ChainEndOrigin = EndableChainOrigin | "partner attack";

const chainEndReasonByOrigin = {
  nominator: "explicit end",
  "game master": "explicit end",
  "turn order": "turn order advanced",
  "sandbox restart": "sandbox restarted",
  "no eligible partner": "no eligible partner",
  "partner attack": "partner attack did not qualify",
} as const satisfies Record<ChainEndOrigin, string>;

export type ChainEndReason = (typeof chainEndReasonByOrigin)[ChainEndOrigin];

interface ChainIdentity {
  readonly chainId: ChainId;
  readonly originalRoller: CombatantReference;
  readonly participants: readonly CombatantReference[];
}

export type FusionChain =
  | (ChainIdentity & { readonly stage: "awaiting target"; readonly nominator: CombatantReference })
  | (ChainIdentity & {
      readonly stage: "awaiting nomination";
      readonly nominator: CombatantReference;
      readonly target: CombatantReference;
    })
  | (ChainIdentity & {
      readonly stage: "awaiting partner attack";
      readonly target: CombatantReference;
      readonly pendingPartner: CombatantReference;
    })
  | (ChainIdentity & {
      readonly stage: "ended";
      readonly target: CombatantReference | undefined;
      readonly endOrigin: ChainEndOrigin;
    });

export type ChainEvent =
  | { readonly kind: "chain started"; readonly chainId: ChainId; readonly originalRoller: CombatantReference }
  | { readonly kind: "target selected"; readonly chainId: ChainId; readonly target: CombatantReference }
  | {
      readonly kind: "partner nominated";
      readonly chainId: ChainId;
      readonly nominator: CombatantReference;
      readonly partner: CombatantReference;
      readonly target: CombatantReference;
    }
  | {
      readonly kind: "partner attack qualified";
      readonly chainId: ChainId;
      readonly partner: CombatantReference;
      readonly nextNominator: CombatantReference;
    }
  | {
      readonly kind: "chain ended";
      readonly chainId: ChainId;
      readonly origin: ChainEndOrigin;
      readonly reason: ChainEndReason;
    };

export type ChainRejection =
  "attack does not qualify" | "wrong stage" | "already a participant" | "roller is not the pending partner";

export type ChainTransition =
  | { readonly outcome: "applied"; readonly chain: FusionChain; readonly events: readonly ChainEvent[] }
  | { readonly outcome: "rejected"; readonly rejection: ChainRejection };

export interface PartnerQualification {
  readonly originalRoller: CombatantReference;
  readonly qualifyingPartner: CombatantReference;
}

// Injected so a product can depart from FR3 without branching on it (FD20, datum Module B).
export type NextNominatorRule = (partnerQualification: PartnerQualification) => CombatantReference;

export const qualifyingPartnerNominates: NextNominatorRule = ({ qualifyingPartner }) => qualifyingPartner;

function reject(rejection: ChainRejection): ChainTransition {
  return { outcome: "rejected", rejection };
}

function endChain(
  chain: Exclude<FusionChain, { stage: "ended" }>,
  origin: ChainEndOrigin,
  target: CombatantReference | undefined,
): ChainTransition {
  const { chainId, originalRoller, participants } = chain;
  return {
    outcome: "applied",
    chain: { chainId, originalRoller, participants, stage: "ended", target, endOrigin: origin },
    events: [{ kind: "chain ended", chainId, origin, reason: chainEndReasonByOrigin[origin] }],
  };
}

export function startFusionChain(chainId: ChainId, attackRoll: AttackRoll): ChainTransition {
  if (!qualifiesForFusionCritical(attackRoll)) {
    return reject("attack does not qualify");
  }
  const originalRoller = attackRoll.rollerReference;
  return {
    outcome: "applied",
    chain: {
      chainId,
      originalRoller,
      participants: [originalRoller],
      stage: "awaiting target",
      nominator: originalRoller,
    },
    events: [{ kind: "chain started", chainId, originalRoller }],
  };
}

export function selectChainTarget(chain: FusionChain, target: CombatantReference): ChainTransition {
  if (chain.stage !== "awaiting target") {
    return reject("wrong stage");
  }
  return {
    outcome: "applied",
    chain: { ...chain, stage: "awaiting nomination", target },
    events: [{ kind: "target selected", chainId: chain.chainId, target }],
  };
}

export function nominatePartner(chain: FusionChain, partner: CombatantReference): ChainTransition {
  if (chain.stage !== "awaiting nomination") {
    return reject("wrong stage");
  }
  if (chain.participants.includes(partner)) {
    return reject("already a participant");
  }
  const { chainId, originalRoller, nominator, target } = chain;
  return {
    outcome: "applied",
    chain: {
      chainId,
      originalRoller,
      participants: [...chain.participants, partner],
      stage: "awaiting partner attack",
      target,
      pendingPartner: partner,
    },
    events: [{ kind: "partner nominated", chainId, nominator, partner, target }],
  };
}

export function resolvePartnerAttack(
  chain: FusionChain,
  attackRoll: AttackRoll,
  chooseNextNominator: NextNominatorRule,
): ChainTransition {
  if (chain.stage !== "awaiting partner attack") {
    return reject("wrong stage");
  }
  if (attackRoll.rollerReference !== chain.pendingPartner) {
    return reject("roller is not the pending partner");
  }
  if (!qualifiesForFusionCritical(attackRoll)) {
    return endChain(chain, "partner attack", chain.target);
  }
  const { chainId, originalRoller, participants, target, pendingPartner: partner } = chain;
  const nextNominator = chooseNextNominator({ originalRoller, qualifyingPartner: partner });
  return {
    outcome: "applied",
    chain: { chainId, originalRoller, participants, stage: "awaiting nomination", nominator: nextNominator, target },
    events: [{ kind: "partner attack qualified", chainId, partner, nextNominator }],
  };
}

export function endFusionChain(chain: FusionChain, origin: EndableChainOrigin): ChainTransition {
  if (chain.stage === "ended") {
    return reject("wrong stage");
  }
  // An assessment only happens at a nomination, so this origin is meaningless anywhere else.
  if (origin === "no eligible partner" && chain.stage !== "awaiting nomination") {
    return reject("wrong stage");
  }
  return endChain(chain, origin, chain.stage === "awaiting target" ? undefined : chain.target);
}
