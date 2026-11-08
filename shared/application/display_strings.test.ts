import { describe, expect, it } from "vitest";
import { chainEndOrigins, chainEndReasonByOrigin } from "../domain/fusion_chain.ts";
import { describeChainEvent, ineligibilityReasonText } from "./display_strings.ts";

const nameOf = (reference: string): string =>
  ({ roller: "Niamh", ally: "FighterMan", goblin: "the Goblin" })[reference] ?? reference;

describe("describeChainEvent", () => {
  it("names the people involved", () => {
    expect(
      describeChainEvent(
        { kind: "partner nominated", chainId: "c1", nominator: "roller", partner: "ally", target: "goblin" },
        nameOf,
      ),
    ).toBe("Niamh nominates FighterMan to attack the Goblin.");
  });

  it("names the roller, the target and the next nominator", () => {
    expect(describeChainEvent({ kind: "chain started", chainId: "c1", originalRoller: "roller" }, nameOf)).toBe(
      "Niamh rolled a fusion critical!",
    );
    expect(describeChainEvent({ kind: "target selected", chainId: "c1", target: "goblin" }, nameOf)).toBe(
      "The fusion chain targets the Goblin.",
    );
    expect(
      describeChainEvent(
        { kind: "partner attack qualified", chainId: "c1", partner: "ally", nextNominator: "roller" },
        nameOf,
      ),
    ).toBe("FighterMan crits too, and Niamh picks the next partner.");
  });

  it("words every end origin differently, so players can tell why a chain ended", () => {
    const sentences = chainEndOrigins.map((origin) =>
      describeChainEvent(
        { kind: "chain ended", chainId: "c1", origin, reason: chainEndReasonByOrigin[origin] },
        nameOf,
      ),
    );
    expect(new Set(sentences).size).toBe(chainEndOrigins.length);
    expect(sentences.every((sentence) => sentence.startsWith("The ") && sentence.length > 20)).toBe(true);
  });

  it("never puts a tag looking word last, so the sentence cannot be read as a chain message", () => {
    const sentence = describeChainEvent(
      { kind: "chain started", chainId: "c1", originalRoller: "roller" },
      () => "[f20:1:started:c9:x]",
    );
    expect(sentence.split(" ").at(-1)?.startsWith("[f20:")).toBe(false);
  });
});

describe("ineligibilityReasonText", () => {
  it("explains a missing range profile with a pointer to the fix, under FD5", () => {
    expect(ineligibilityReasonText["no range profile"]).toContain("range");
  });
});
