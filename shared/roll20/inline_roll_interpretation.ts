import { isRecord, measureSerialisedLength, readFiniteNumber, readText } from "./untrusted_value.ts";

export type DigitalMarker = "critical" | "fumble" | "none";

export type InlineRollRefusal =
  "not an inline roll" | "inline roll too large" | "no d20" | "unrecognised digital roll" | "die out of range";

export type InlineRollReading =
  | { readonly outcome: "rolled"; readonly naturalD20s: readonly number[]; readonly criticalPoint: number | undefined }
  | { readonly outcome: "digital"; readonly naturalD20: number; readonly marker: DigitalMarker }
  | { readonly outcome: "unreadable"; readonly reason: InlineRollRefusal };

// Far above any roll captured, which were under one kilobyte. Checked before reading anything.
const maximumInlineRollLength = 5000;
// A minimum ten roll nests one group, so two levels is the deepest seen. Four leaves room.
const maximumGroupDepth = 4;
const d20Sides = 20;
const lowestNatural = 1;
const highestNatural = 20;

const digitalLabelPattern = /^1d20(?:\s|$)/u;
const digitalCommentPattern = /^= \((\d{1,2})\)/u;

function refuse(reason: InlineRollRefusal): InlineRollReading {
  return { outcome: "unreadable", reason };
}

function isNatural(candidate: number | undefined): candidate is number {
  return (
    candidate !== undefined && Number.isInteger(candidate) && candidate >= lowestNatural && candidate <= highestNatural
  );
}

function readFirstComparisonPoint(mods: unknown, modName: string): number | undefined {
  if (!isRecord(mods)) {
    return undefined;
  }
  const comparisons = mods[modName];
  if (!Array.isArray(comparisons) || !isRecord(comparisons[0]) || comparisons[0].comp !== ">=") {
    return undefined;
  }
  return readFiniteNumber(comparisons[0].point);
}

function readDigitalMarker(rolls: readonly unknown[]): DigitalMarker {
  const markerRoll = rolls.find((roll) => isRecord(roll) && roll.type === "R" && roll.sides === 0);
  if (!isRecord(markerRoll)) {
    return "none";
  }
  // Beyond20 writes cs>0 for a critical and cf>0 for a fumble, and the other comparison as 1.
  if (readFirstComparisonPoint(markerRoll.mods, "customCrit") === 0) {
    return "critical";
  }
  return readFirstComparisonPoint(markerRoll.mods, "customFumble") === 0 ? "fumble" : "none";
}

function readTextOfType(rolls: readonly unknown[], rollType: string): string | undefined {
  const matchingRoll = rolls.find((roll) => isRecord(roll) && roll.type === rollType);
  return isRecord(matchingRoll) ? readText(matchingRoll.text) : undefined;
}

function interpretDigitalRoll(rolls: readonly unknown[]): InlineRollReading {
  const label = readTextOfType(rolls, "L") ?? "";
  if (!digitalLabelPattern.test(label)) {
    return refuse("no d20");
  }
  const commentMatch = digitalCommentPattern.exec(readTextOfType(rolls, "C") ?? "");
  if (commentMatch?.[1] === undefined) {
    return refuse("unrecognised digital roll");
  }
  const naturalD20 = Number(commentMatch[1]);
  return isNatural(naturalD20)
    ? { outcome: "digital", naturalD20, marker: readDigitalMarker(rolls) }
    : refuse("die out of range");
}

interface D20Collection {
  readonly naturalD20s: number[];
  criticalPoint: number | undefined;
  hasOutOfRangeDie: boolean;
}

function collectD20s(rolls: readonly unknown[], collection: D20Collection, depth: number): void {
  if (depth > maximumGroupDepth) {
    return;
  }
  for (const roll of rolls) {
    if (!isRecord(roll)) {
      continue;
    }
    if (roll.type === "G" && Array.isArray(roll.rolls)) {
      for (const groupRolls of roll.rolls) {
        if (Array.isArray(groupRolls)) {
          collectD20s(groupRolls, collection, depth + 1);
        }
      }
      continue;
    }
    if (roll.type !== "R" || roll.sides !== d20Sides || !Array.isArray(roll.results)) {
      continue;
    }
    collection.criticalPoint ??= readFirstComparisonPoint(roll.mods, "customCrit");
    for (const dieResult of roll.results) {
      // A dropped die carries d: true wherever it sits, including a rerolled 1 (FF70, FF71).
      if (!isRecord(dieResult) || dieResult.d === true) {
        continue;
      }
      const dieValue = readFiniteNumber(dieResult.v);
      if (isNatural(dieValue)) {
        collection.naturalD20s.push(dieValue);
      } else {
        collection.hasOutOfRangeDie = true;
      }
    }
  }
}

function interpretRolledRoll(rolls: readonly unknown[]): InlineRollReading {
  const collection: D20Collection = { naturalD20s: [], criticalPoint: undefined, hasOutOfRangeDie: false };
  collectD20s(rolls, collection, 0);
  if (collection.hasOutOfRangeDie) {
    return refuse("die out of range");
  }
  // No d20 at all means a typed number such as [[20]], which is not a roll (FD19).
  if (collection.naturalD20s.length === 0) {
    return refuse("no d20");
  }
  return { outcome: "rolled", naturalD20s: collection.naturalD20s, criticalPoint: collection.criticalPoint };
}

export function interpretInlineRoll(inlineRoll: unknown): InlineRollReading {
  if (!isRecord(inlineRoll) || !isRecord(inlineRoll.results) || !Array.isArray(inlineRoll.results.rolls)) {
    return refuse("not an inline roll");
  }
  const serialisedLength = measureSerialisedLength(inlineRoll);
  if (serialisedLength === undefined || serialisedLength > maximumInlineRollLength) {
    return refuse("inline roll too large");
  }
  const rolls: readonly unknown[] = inlineRoll.results.rolls;
  // Beyond20's digital format is the only one with a comment entry, which holds the dice it rolled.
  const isDigital = rolls.some((roll) => isRecord(roll) && roll.type === "C");
  return isDigital ? interpretDigitalRoll(rolls) : interpretRolledRoll(rolls);
}
