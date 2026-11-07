import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { encodeRangeProfile, maximumRangeProfileLength, parseRangeProfile } from "./range_profile_grammar.ts";

describe("parseRangeProfile", () => {
  it("reads one attack", () => {
    expect(parseRangeProfile("melee=5")).toEqual({
      outcome: "parsed",
      profile: { meleeReach: 5, rangedLongRange: undefined, cantripRange: undefined },
    });
  });

  it("reads all three, in any order", () => {
    expect(parseRangeProfile("cantrip=120,melee=10,ranged=600")).toEqual({
      outcome: "parsed",
      profile: { meleeReach: 10, rangedLongRange: 600, cantripRange: 120 },
    });
  });

  it.each([
    ["", "empty value"],
    ["melee", "malformed entry"],
    ["melee=", "invalid range"],
    ["=5", "unknown attack kind"],
    ["melee=5=5", "malformed entry"],
    ["melee=5,", "malformed entry"],
    [",melee=5", "malformed entry"],
    ["melee=5,,ranged=10", "malformed entry"],
    ["thrown=20", "unknown attack kind"],
    ["MELEE=5", "unknown attack kind"],
    ["melee=5,melee=10", "repeated attack kind"],
    ["melee=0", "invalid range"],
    ["melee=-5", "invalid range"],
    ["melee=5.5", "invalid range"],
    ["melee=0x10", "invalid range"],
    ["melee=1e3", "invalid range"],
    ["melee= 5", "invalid range"],
    ["melee=10000", "invalid range"],
    [" melee=5", "unknown attack kind"],
    ["__proto__=5", "unknown attack kind"],
    ["constructor=5", "unknown attack kind"],
  ])("refuses %j as %s", (attributeValue, reason) => {
    expect(parseRangeProfile(attributeValue)).toEqual({ outcome: "refused", reason });
  });

  it("refuses an over length value rather than truncating it", () => {
    const overLength = `melee=5,${"x".repeat(maximumRangeProfileLength)}`;
    expect(parseRangeProfile(overLength)).toEqual({ outcome: "refused", reason: "value too long" });
  });

  it("accepts the longest legal value, so the bound fits the grammar exactly", () => {
    const longest = "melee=9999,ranged=9999,cantrip=9999";
    expect(longest).toHaveLength(maximumRangeProfileLength);
    expect(parseRangeProfile(longest).outcome).toBe("parsed");
  });
});

describe("encodeRangeProfile", () => {
  it("writes attacks in table order and leaves out those absent", () => {
    expect(encodeRangeProfile({ meleeReach: 5, rangedLongRange: undefined, cantripRange: 120 })).toBe(
      "melee=5,cantrip=120",
    );
  });
});

const rangeArbitrary = fc.option(fc.integer({ min: 1, max: 9999 }), { nil: undefined });
const profileArbitrary = fc
  .record({ meleeReach: rangeArbitrary, rangedLongRange: rangeArbitrary, cantripRange: rangeArbitrary })
  .filter((profile) => Object.values(profile).some((range) => range !== undefined));

describe("the grammar round trip", () => {
  it("parses whatever it encodes back to the same profile", () => {
    fc.assert(
      fc.property(profileArbitrary, (profile) => {
        expect(parseRangeProfile(encodeRangeProfile(profile))).toEqual({ outcome: "parsed", profile });
      }),
    );
  });
});

// Runs on every change, not on a schedule (datum 0.10 GUIDANCE). A character attribute is set by
// the player, so this parser takes hostile text.
describe("fuzz: parseRangeProfile", () => {
  const fuzzRuns = 20_000;

  it("never throws, and only ever returns a profile that re-encodes within the bound", () => {
    const grammarAlphabet = fc.constantFrom(
      "m",
      "e",
      "l",
      "a",
      "=",
      ",",
      "1",
      "5",
      "-",
      " ",
      "ranged",
      "melee",
      "cantrip",
    );
    const nearGrammar = fc.array(grammarAlphabet, { maxLength: 40 }).map((fragments) => fragments.join(""));
    fc.assert(
      fc.property(
        fc.oneof(fc.string({ maxLength: 200 }), fc.string({ unit: "binary", maxLength: 200 }), nearGrammar),
        (attributeValue) => {
          const parsing = parseRangeProfile(attributeValue);
          if (parsing.outcome === "parsed") {
            expect(encodeRangeProfile(parsing.profile).length).toBeLessThanOrEqual(maximumRangeProfileLength);
          }
        },
      ),
      { numRuns: fuzzRuns },
    );
  });
});
