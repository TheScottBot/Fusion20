import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertHoldsForHostileText } from "../testing/index.ts";
import { chainEndOrigins, chainEndReasonByOrigin, type ChainEvent } from "../domain/fusion_chain.ts";
import { encodeChainMessage, maximumChainMessageLength, parseChainMessage } from "./chain_message_table.ts";

const exampleEvents: readonly ChainEvent[] = [
  { kind: "chain started", chainId: "c7", originalRoller: "roller" },
  { kind: "target selected", chainId: "c7", target: "goblin" },
  { kind: "partner nominated", chainId: "c7", nominator: "roller", partner: "ally", target: "goblin" },
  { kind: "partner attack qualified", chainId: "c7", partner: "ally", nextNominator: "ally" },
  ...chainEndOrigins.map((origin) => ({
    kind: "chain ended" as const,
    chainId: "c7",
    origin,
    reason: chainEndReasonByOrigin[origin],
  })),
];

describe("every chain message", () => {
  it.each(exampleEvents)("round trips $kind", (chainEvent) => {
    const message = encodeChainMessage(chainEvent, "A readable sentence.");
    expect(parseChainMessage(message)).toEqual({ outcome: "parsed", chainEvent });
  });

  it("is a sentence followed by a tag", () => {
    const chainEvent = { kind: "partner nominated", chainId: "c7", nominator: "a", partner: "b", target: "c" } as const;
    expect(encodeChainMessage(chainEvent, "Niamh nominates FighterMan against the Goblin.")).toBe(
      "Niamh nominates FighterMan against the Goblin. [f20:1:nominated:c7:a:b:c]",
    );
  });

  it("reads a name that looks like a tag as part of the sentence, since only the last word counts", () => {
    const chainEvent = { kind: "target selected", chainId: "c7", target: "real" } as const;
    const message = encodeChainMessage(chainEvent, "[f20:1:target:c9:forged] picks a target.");
    expect(parseChainMessage(message)).toEqual({ outcome: "parsed", chainEvent });
  });
});

describe("parseChainMessage", () => {
  it.each([
    ["Just some ordinary chat", "not a chain message"],
    ["", "not a chain message"],
    ["Ends with [brackets]", "not a chain message"],
    ["Text [f20:1:started:c7:roller] and more text", "not a chain message"],
  ])("treats %j as ordinary chat", (messageText, reason) => {
    expect(parseChainMessage(messageText)).toEqual({ outcome: "refused", reason });
  });

  it.each([
    ["S. [f20:2:started:c7:roller]", "unsupported version"],
    ["S. [f20:x:started:c7:roller]", "unsupported version"],
    ["S. [f20:1:teleported:c7:roller]", "unknown message"],
    ["S. [f20:1:__proto__:c7:roller]", "unknown message"],
    ["S. [f20:1:nominated:c7:a:b]", "wrong field count"],
    ["S. [f20:1:started:c7:a:extra]", "wrong field count"],
    ["S. [f20:1:started]", "wrong field count"],
    ["S. [f20:1:started::roller]", "invalid value"],
    ["S. [f20:1:started:c7:]", "invalid value"],
    ["S. [f20:1:started:c7:<b>]", "invalid value"],
    ["S. [f20:1:ended:c7:somebody]", "invalid value"],
    ["S. [f20:1:ended:c7:game master]", "not a chain message"],
    ["S. [f20:1:started:c7:roller", "not a chain message"],
  ])("refuses %j as %s", (messageText, reason) => {
    expect(parseChainMessage(messageText)).toEqual({ outcome: "refused", reason });
  });

  it("refuses an over length message rather than truncating it", () => {
    const overLength = `${"a".repeat(maximumChainMessageLength)} [f20:1:started:c7:roller]`;
    expect(parseChainMessage(overLength)).toEqual({ outcome: "refused", reason: "message too long" });
  });
});

const identifier = fc.stringMatching(/^[A-Za-z0-9_-]{1,32}$/u);
const sentence = fc.string({ maxLength: 120 }).map((text) => text.replaceAll(/\s/gu, "_"));

describe("the chain message round trip", () => {
  it("holds for any legal references and any sentence", () => {
    const chainEventArbitrary = fc.oneof(
      fc.record({ kind: fc.constant("chain started" as const), chainId: identifier, originalRoller: identifier }),
      fc.record({ kind: fc.constant("target selected" as const), chainId: identifier, target: identifier }),
      fc.record({
        kind: fc.constant("partner nominated" as const),
        chainId: identifier,
        nominator: identifier,
        partner: identifier,
        target: identifier,
      }),
    );
    fc.assert(
      fc.property(chainEventArbitrary, sentence, (chainEvent, sentenceText) => {
        expect(parseChainMessage(encodeChainMessage(chainEvent, sentenceText))).toEqual({
          outcome: "parsed",
          chainEvent,
        });
      }),
    );
  });
});

describe("fuzz: parseChainMessage", () => {
  it("never throws, and anything it accepts survives a round trip", () => {
    assertHoldsForHostileText(
      ["[f20:", "1:", "started", "nominated", "ended", ":", "c7", "]", " ", "game-master", "a"],
      (hostileText) => {
        const parsing = parseChainMessage(hostileText);
        if (parsing.outcome === "parsed") {
          expect(parseChainMessage(encodeChainMessage(parsing.chainEvent, "S."))).toEqual(parsing);
        }
      },
    );
  });
});
