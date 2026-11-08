import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertHoldsForHostileText } from "../testing/index.ts";
import { encodeCommand, maximumCommandLength, parseCommand, type ChatCommand } from "./command_table.ts";

const tokenId = "-P5rQ-2197p1ravZZunN";

const exampleCommands: readonly ChatCommand[] = [
  { verb: "target", chain: "c7", token: tokenId },
  { verb: "nominate", chain: "c7", partner: tokenId },
  { verb: "end", chain: "c7" },
  { verb: "range", character: tokenId, value: "melee=15,ranged=150" },
];

describe("every command", () => {
  it.each(exampleCommands)("round trips $verb", (command) => {
    expect(parseCommand(encodeCommand(command))).toEqual({ outcome: "parsed", command });
  });

  it("encodes as a Roll20 api command, with the prefix and named arguments", () => {
    expect(encodeCommand({ verb: "nominate", chain: "c7", partner: "abc" })).toBe(
      "!fusion20 nominate chain=c7 partner=abc",
    );
  });
});

describe("parseCommand", () => {
  it("accepts arguments in any order", () => {
    expect(parseCommand("!fusion20 nominate partner=abc chain=c7")).toEqual({
      outcome: "parsed",
      command: { verb: "nominate", chain: "c7", partner: "abc" },
    });
  });

  it("keeps an equals sign inside a value", () => {
    expect(parseCommand("!fusion20 range character=abc value=melee=5")).toMatchObject({
      command: { value: "melee=5" },
    });
  });

  it.each([
    ["hello there", "not a command"],
    ["!other nominate", "not a command"],
    ["!fusion20x end chain=c7", "not a command"],
    ["!fusion20", "missing verb"],
    ["!fusion20 teleport chain=c7", "unknown verb"],
    ["!fusion20 __proto__ chain=c7", "unknown verb"],
    ["!fusion20 END chain=c7", "unknown verb"],
    ["!fusion20 end", "missing argument"],
    ["!fusion20 nominate chain=c7", "missing argument"],
    ["!fusion20 end chain=c7 extra=1", "unknown argument"],
    ["!fusion20 end __proto__=1 chain=c7", "unknown argument"],
    ["!fusion20 end chain=c7 chain=c8", "repeated argument"],
    ["!fusion20 end chain", "malformed argument"],
    ["!fusion20 end =c7", "malformed argument"],
    ["!fusion20 end  chain=c7", "malformed argument"],
    ["!fusion20 end chain=c7 ", "malformed argument"],
    ["!fusion20 end chain=", "invalid value"],
    ["!fusion20 end chain=c:7", "invalid value"],
    ["!fusion20 end chain=c 7", "malformed argument"],
    ["!fusion20 end chain=<script>", "invalid value"],
    ["!fusion20 range character=abc value=bad", "invalid value"],
    ["!fusion20 range character=abc value=melee=0", "invalid value"],
  ])("refuses %j as %s", (commandText, reason) => {
    expect(parseCommand(commandText)).toEqual({ outcome: "refused", reason });
  });

  it("refuses an over length command rather than truncating it", () => {
    const overLength = `!fusion20 end chain=${"a".repeat(maximumCommandLength)}`;
    expect(parseCommand(overLength)).toEqual({ outcome: "refused", reason: "command too long" });
  });

  it("refuses an identifier beyond its own bound", () => {
    expect(parseCommand(`!fusion20 end chain=${"a".repeat(33)}`)).toEqual({
      outcome: "refused",
      reason: "invalid value",
    });
  });

  it("fits the longest legal command inside the bound", () => {
    const longId = "a".repeat(32);
    const longest = encodeCommand({ verb: "range", character: longId, value: "melee=9999,ranged=9999,cantrip=9999" });
    expect(parseCommand(longest).outcome).toBe("parsed");
    expect(longest.length).toBeLessThanOrEqual(maximumCommandLength);
  });
});

const identifier = fc.stringMatching(/^[A-Za-z0-9_-]{1,32}$/u);

describe("the command round trip", () => {
  it("holds for any legal identifiers", () => {
    const commandArbitrary = fc.oneof(
      fc.record({ verb: fc.constant("target" as const), chain: identifier, token: identifier }),
      fc.record({ verb: fc.constant("nominate" as const), chain: identifier, partner: identifier }),
      fc.record({ verb: fc.constant("end" as const), chain: identifier }),
    );
    fc.assert(
      fc.property(commandArbitrary, (command) => {
        expect(parseCommand(encodeCommand(command))).toEqual({ outcome: "parsed", command });
      }),
    );
  });
});

// Anyone in the game can type anything, so this parser takes hostile text.
describe("fuzz: parseCommand", () => {
  it("never throws, and anything it accepts survives a round trip", () => {
    assertHoldsForHostileText(
      ["!fusion20", " ", "end", "target", "nominate", "range", "chain=", "token=", "c7", "="],
      (hostileText) => {
        const parsing = parseCommand(hostileText);
        if (parsing.outcome === "parsed") {
          expect(parseCommand(encodeCommand(parsing.command))).toEqual(parsing);
        }
      },
    );
  });
});
