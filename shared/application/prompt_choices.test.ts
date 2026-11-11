import { describe, expect, it } from "vitest";
import type { PartnerAssessment } from "../domain/partner_eligibility.ts";
import { chooseTargetCandidates, choosePromptPartners } from "./prompt_choices.ts";

function assessment(reference: string, reasons: PartnerAssessment["reasons"]): PartnerAssessment {
  return { reference, isEligible: reasons.length === 0, reasons, distance: 5 };
}

describe("choosePromptPartners", () => {
  it("offers eligible allies, lists other allies, and leaves hostiles out, in the domain's order", () => {
    const choices = choosePromptPartners([
      assessment("bard", []),
      assessment("fighter", []),
      assessment("goblin", ["not an ally", "is the target"]),
      assessment("roller", ["already a participant"]),
      assessment("wolf", ["not an ally"]),
      assessment("archer", ["cannot see target"]),
    ]);
    expect([
      choices.eligible.map(({ reference }) => reference),
      choices.ineligibleAllies.map(({ reference }) => reference),
    ]).toEqual([
      ["bard", "fighter"],
      ["roller", "archer"],
    ]);
  });
});

describe("chooseTargetCandidates", () => {
  it("offers every combatant except the nominator (FD16)", () => {
    const combatants = [{ reference: "roller" }, { reference: "goblin" }, { reference: "ally" }];
    expect(chooseTargetCandidates(combatants, "roller")).toEqual([{ reference: "goblin" }, { reference: "ally" }]);
  });
});
