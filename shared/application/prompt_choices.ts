import type { CombatantReference } from "../domain/attack_roll.ts";
import type { PartnerAssessment } from "../domain/partner_eligibility.ts";

// What a prompt offers, decided once so the Mod's whispers and the extension's overlay show the
// same choices (section 2: no candidate rule lives in a product).

export interface PromptPartnerChoices {
  readonly eligible: readonly PartnerAssessment[];
  readonly ineligibleAllies: readonly PartnerAssessment[];
}

// Hostile tokens are left out, or a large fight would bury the allies under them (FF95). The
// domain's order, eligible first and then by distance, is kept.
export function choosePromptPartners(assessments: readonly PartnerAssessment[]): PromptPartnerChoices {
  const allies = assessments.filter((assessment) => !assessment.reasons.includes("not an ally"));
  return {
    eligible: allies.filter((assessment) => assessment.isEligible),
    ineligibleAllies: allies.filter((assessment) => !assessment.isEligible),
  };
}

// FD16: any token on the battlefield except the nominator. Light tokens never reach it (FF46).
export function chooseTargetCandidates<Combatant extends { readonly reference: CombatantReference }>(
  combatants: readonly Combatant[],
  nominator: CombatantReference,
): readonly Combatant[] {
  return combatants.filter((combatant) => combatant.reference !== nominator);
}
