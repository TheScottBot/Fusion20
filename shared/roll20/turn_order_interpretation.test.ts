import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hasTurnOrderAdvanced, maximumTurnOrderLength } from "./turn_order_interpretation.ts";

function turnOrderOf(...entries: readonly Readonly<Record<string, unknown>>[]): string {
  return JSON.stringify(entries);
}

const fighterFirst = turnOrderOf({ id: "-Nfighter", pr: "18", custom: "" }, { id: "-Ngoblin", pr: "12", custom: "" });
const goblinFirst = turnOrderOf({ id: "-Ngoblin", pr: "12", custom: "" }, { id: "-Nfighter", pr: "18", custom: "" });

describe("hasTurnOrderAdvanced", () => {
  it("sees the turn move on when a new entry reaches the top", () => {
    expect(hasTurnOrderAdvanced(fighterFirst, goblinFirst)).toBe(true);
  });

  it("ignores a change that leaves the same entry on top, such as a new initiative value", () => {
    const editedValue = turnOrderOf({ id: "-Nfighter", pr: "20", custom: "" }, { id: "-Ngoblin", pr: "12" });
    expect(hasTurnOrderAdvanced(fighterFirst, editedValue)).toBe(false);
  });

  it("tells two custom entries apart by their text", () => {
    const roundCounter = turnOrderOf({ id: "-1", pr: "1", custom: "Round" });
    const lairAction = turnOrderOf({ id: "-1", pr: "20", custom: "Lair action" });
    expect(hasTurnOrderAdvanced(roundCounter, lairAction)).toBe(true);
  });

  it("counts starting and clearing the turn order as the turn moving on", () => {
    expect([hasTurnOrderAdvanced("", fighterFirst), hasTurnOrderAdvanced(fighterFirst, "[]")]).toEqual([true, true]);
  });

  it.each([
    ["two empty values", "", ""],
    ["text that is not JSON", "{", "not json"],
    ["values that are not text", 7, undefined],
    ["entries that are not objects", "[1]", '["x"]'],
    [
      "an entry in a value over the bound and nothing",
      JSON.stringify([{ id: "-Nfighter", custom: "x".repeat(maximumTurnOrderLength) }]),
      "",
    ],
  ])("does not see an advance between %s", (_description, previousTurnOrder, currentTurnOrder) => {
    expect(hasTurnOrderAdvanced(previousTurnOrder, currentTurnOrder)).toBe(false);
  });

  it("reads a value at the bound but not over it", () => {
    const atBound = turnOrderOf({ id: "-Nfighter", custom: "x".repeat(maximumTurnOrderLength - 40) });
    expect(atBound.length).toBeLessThanOrEqual(maximumTurnOrderLength);
    expect(hasTurnOrderAdvanced("", atBound)).toBe(true);
  });

  it("never throws on arbitrary values", () => {
    fc.assert(
      fc.property(fc.anything(), fc.string(), (previousTurnOrder, currentTurnOrder) => {
        expect(typeof hasTurnOrderAdvanced(previousTurnOrder, currentTurnOrder)).toBe("boolean");
      }),
      { numRuns: 2000 },
    );
  });
});
