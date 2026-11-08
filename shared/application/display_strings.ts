import type { CombatantReference } from "../domain/attack_roll.ts";
import type { ChainEndOrigin, ChainEvent } from "../domain/fusion_chain.ts";
import type { IneligibilityReason } from "../domain/partner_eligibility.ts";

// Every user facing string lives here, so a product renders text and never writes it. These are
// the agent's first drafts: Roll20's AI policy wants creative text from a person, so the author
// rewrites them before any Mod Library submission (FD22).

export type NameLookup = (reference: CombatantReference) => string;

const chainEndWording: Readonly<Record<ChainEndOrigin, string>> = {
  "partner attack": "The fusion chain ends: that attack was not a critical.",
  "no eligible partner": "The fusion chain ends: nobody else can reach and see the target.",
  nominator: "The fusion chain ends, as the nominator chose.",
  "game master": "The GM ends the fusion chain.",
  "turn order": "The fusion chain ends as the turn moves on.",
  "sandbox restart": "The fusion chain ends because the Mod restarted.",
};

// Each sentence ends on fixed wording or punctuation, never a bare name, so a character named
// like a chain message tag cannot make the sentence read as one.
export function describeChainEvent(chainEvent: ChainEvent, nameOf: NameLookup): string {
  switch (chainEvent.kind) {
    case "chain started":
      return `${nameOf(chainEvent.originalRoller)} rolled a fusion critical!`;
    case "target selected":
      return `The fusion chain targets ${nameOf(chainEvent.target)}.`;
    case "partner nominated":
      return `${nameOf(chainEvent.nominator)} nominates ${nameOf(chainEvent.partner)} to attack ${nameOf(chainEvent.target)}.`;
    case "partner attack qualified":
      return `${nameOf(chainEvent.partner)} crits too, and ${nameOf(chainEvent.nextNominator)} picks the next partner.`;
    case "chain ended":
      return chainEndWording[chainEvent.origin];
  }
}

export const ineligibilityReasonText: Readonly<Record<IneligibilityReason, string>> = {
  "not an ally": "Not an ally",
  "already a participant": "Already in this chain",
  "is the target": "Is the target",
  "no range profile": "No attack range set: add a fusion20 range to the character sheet",
  "malformed range profile": "Attack range could not be read: check the fusion20 range on the character sheet",
  "out of range": "Cannot reach the target",
  "cannot see target": "Cannot see the target",
};

export function targetPromptText(nominatorName: string): string {
  return `${nominatorName}, pick a target for your fusion critical.`;
}

export function partnerPromptText(nominatorName: string, targetName: string): string {
  return `${nominatorName}, pick a partner to attack ${targetName}.`;
}
