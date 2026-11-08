import { selectKeptNaturalD20, type RollMode } from "../domain/attack_roll.ts";
import { interpretInlineRoll, type InlineRollReading, type InlineRollRefusal } from "./inline_roll_interpretation.ts";
import { isRecord, readText } from "./untrusted_value.ts";

export interface ObservedChatMessage {
  readonly content: unknown;
  readonly inlinerolls: unknown;
  readonly rolltemplate: unknown;
  readonly playerid: unknown;
}

export type IgnoredReason = "no roll template" | "not an attack template" | "not an attack";

export type UnreadableReason =
  | InlineRollRefusal
  | "message too large"
  | "missing player"
  | "missing character name"
  | "no kept die"
  | "missing roll"
  | "mixed roll formats"
  | "threshold out of range";

export type Beyond20RollReading =
  | {
      readonly outcome: "attack";
      readonly characterName: string;
      readonly playerId: string;
      readonly keptNaturalD20: number;
      readonly criticalThreshold: number;
    }
  | { readonly outcome: "ignored"; readonly reason: IgnoredReason }
  | { readonly outcome: "unreadable"; readonly reason: UnreadableReason };

// Bounds well above any message captured, which were under 400 characters of content.
const maximumContentLength = 3000;
const maximumInlineRollCount = 4;
const maximumFieldCount = 40;
const maximumCharacterNameLength = 100;
const maximumPlayerIdLength = 64;

// Templates Beyond20 uses for attacks, read from its source and seen in captures.
const attackTemplates = new Set(["simple", "atk", "atkdmg"]);
// FD18: on the digital path a marked natural die counts only from 18 up, Superior Critical's
// threshold, because a forced critical carries the same marker on any die.
const lowestDigitalCriticalNatural = 18;
// FD17: a forced critical writes cs>1, which hides the real threshold, so it counts as 20.
const forcedCriticalPoint = 1;
const ordinaryThreshold = 20;
const lowestRealThreshold = 2;

const templateFieldPattern = /\{\{([^{}=]*)=([^{}]*)\}\}/gu;
const rollReferencePattern = /^\$\[\[(\d{1,2})\]\]$/u;

type ReadRoll = Exclude<InlineRollReading, { outcome: "unreadable" }>;

function ignore(reason: IgnoredReason): Beyond20RollReading {
  return { outcome: "ignored", reason };
}

function unreadable(reason: UnreadableReason): Beyond20RollReading {
  return { outcome: "unreadable", reason };
}

function readTemplateFields(content: string): Map<string, string> | undefined {
  const fields = new Map<string, string>();
  for (const fieldMatch of content.matchAll(templateFieldPattern)) {
    if (fields.size >= maximumFieldCount) {
      return undefined;
    }
    const [, fieldName, fieldValue] = fieldMatch;
    if (fieldName !== undefined && fieldValue !== undefined && !fields.has(fieldName)) {
      fields.set(fieldName, fieldValue);
    }
  }
  return fields;
}

function readRollMode(fields: ReadonlyMap<string, string>): RollMode | undefined {
  if (fields.get("advantage") === "1") {
    return "advantage";
  }
  if (fields.get("disadvantage") === "1") {
    return "disadvantage";
  }
  // Roll twice, with always=1, shows two rolls with neither chosen, so there is no kept die.
  return fields.get("normal") === "1" ? "normal" : undefined;
}

function readReferencedRoll(
  fieldValue: string | undefined,
  inlineRolls: readonly unknown[],
): InlineRollReading | undefined {
  const referenceMatch = rollReferencePattern.exec(fieldValue ?? "");
  if (referenceMatch?.[1] === undefined) {
    return undefined;
  }
  const inlineRoll: unknown = inlineRolls[Number(referenceMatch[1])];
  return inlineRoll === undefined ? undefined : interpretInlineRoll(inlineRoll);
}

function digitalThreshold(rolls: readonly ReadRoll[], keptNaturalD20: number): number {
  const keptRoll = rolls.find((roll) => roll.outcome === "digital" && roll.naturalD20 === keptNaturalD20);
  // The marker sits on each roll, so only the kept roll's marker counts (FF74).
  const keptRollIsMarked = keptRoll?.outcome === "digital" && keptRoll.marker === "critical";
  return keptRollIsMarked && keptNaturalD20 >= lowestDigitalCriticalNatural ? keptNaturalD20 : ordinaryThreshold;
}

function rolledThreshold(rolls: readonly ReadRoll[], keptNaturalD20: number): number | undefined {
  const keptRoll = rolls.find((roll) => roll.outcome === "rolled" && roll.naturalD20s.includes(keptNaturalD20));
  const criticalPoint = keptRoll?.outcome === "rolled" ? keptRoll.criticalPoint : undefined;
  if (criticalPoint === undefined || criticalPoint === forcedCriticalPoint) {
    return ordinaryThreshold;
  }
  const isRealThreshold =
    Number.isInteger(criticalPoint) && criticalPoint >= lowestRealThreshold && criticalPoint <= ordinaryThreshold;
  return isRealThreshold ? criticalPoint : undefined;
}

export function interpretBeyond20Roll(message: ObservedChatMessage): Beyond20RollReading {
  const template = readText(message.rolltemplate);
  if (template === undefined || template.length === 0) {
    return ignore("no roll template");
  }
  const content = readText(message.content) ?? "";
  const inlineRolls: readonly unknown[] = Array.isArray(message.inlinerolls) ? message.inlinerolls : [];
  if (content.length > maximumContentLength || inlineRolls.length > maximumInlineRollCount) {
    return unreadable("message too large");
  }
  if (!attackTemplates.has(template)) {
    return ignore("not an attack template");
  }
  const fields = readTemplateFields(content);
  if (fields === undefined) {
    return unreadable("message too large");
  }
  // Beyond20 marks every d20 roll attack=1, including skill checks and saves, so an attack is
  // known by its to hit modifier, which only attacks carry (FF29).
  if (fields.get("attack") !== "1" || (fields.get("mod") ?? "").length === 0) {
    return ignore("not an attack");
  }
  const playerId = readText(message.playerid) ?? "";
  if (playerId.length === 0 || playerId.length > maximumPlayerIdLength) {
    return unreadable("missing player");
  }
  // Beyond20 leaves a trailing space on some names, as the captures show.
  const characterName = (fields.get("charname") ?? "").trim();
  if (characterName.length === 0 || characterName.length > maximumCharacterNameLength) {
    return unreadable("missing character name");
  }
  const rollMode = readRollMode(fields);
  if (rollMode === undefined) {
    return unreadable("no kept die");
  }
  const rollFields = rollMode === "normal" ? ["r1"] : ["r1", "r2"];
  const readings = rollFields.map((fieldName) => readReferencedRoll(fields.get(fieldName), inlineRolls));
  const rolls: ReadRoll[] = [];
  for (const reading of readings) {
    if (reading === undefined) {
      return unreadable("missing roll");
    }
    if (reading.outcome === "unreadable") {
      return unreadable(reading.reason);
    }
    rolls.push(reading);
  }
  const [firstRoll] = rolls;
  if (firstRoll === undefined) {
    return unreadable("missing roll");
  }
  if (rolls.some((roll) => roll.outcome !== firstRoll.outcome)) {
    return unreadable("mixed roll formats");
  }
  const naturalD20s = rolls.flatMap((roll) => (roll.outcome === "digital" ? [roll.naturalD20] : roll.naturalD20s));
  const [firstNatural, ...otherNaturals] = naturalD20s;
  const keptNaturalD20 =
    firstNatural === undefined ? undefined : selectKeptNaturalD20([firstNatural, ...otherNaturals], rollMode);
  if (keptNaturalD20 === undefined) {
    return unreadable("no kept die");
  }
  const criticalThreshold =
    firstRoll.outcome === "digital" ? digitalThreshold(rolls, keptNaturalD20) : rolledThreshold(rolls, keptNaturalD20);
  if (criticalThreshold === undefined) {
    return unreadable("threshold out of range");
  }
  return { outcome: "attack", characterName, playerId, keptNaturalD20, criticalThreshold };
}

export function isObservedChatMessage(candidate: unknown): candidate is ObservedChatMessage {
  return isRecord(candidate);
}
