import type { AttackRangeProfile } from "../domain/attack_reach.ts";
import type { RangeProfileReading } from "../domain/partner_eligibility.ts";

export type RangeProfileRefusal =
  | "value too long"
  | "empty value"
  | "malformed entry"
  | "unknown attack kind"
  | "repeated attack kind"
  | "invalid range";

export type RangeProfileParsing =
  | { readonly outcome: "parsed"; readonly profile: AttackRangeProfile }
  | { readonly outcome: "refused"; readonly reason: RangeProfileRefusal };

// One table, from which the parser, the encoder and the length bound all derive (datum 0.7).
const attackKinds = [
  { token: "melee", profileField: "meleeReach" },
  { token: "ranged", profileField: "rangedLongRange" },
  { token: "cantrip", profileField: "cantripRange" },
] as const;

const entrySeparator = ",";
const valueSeparator = "=";
const maximumRangeDigits = 4;
const rangePattern = new RegExp(`^[1-9][0-9]{0,${String(maximumRangeDigits - 1)}}$`, "u");

// Taken from the grammar and never from the input, so nothing longer can be legal (datum 0.10).
export const maximumRangeProfileLength = attackKinds.reduce((totalLength, attackKind, kindIndex) => {
  const separatorLength = kindIndex === 0 ? 0 : entrySeparator.length;
  return totalLength + separatorLength + attackKind.token.length + valueSeparator.length + maximumRangeDigits;
}, 0);

function refuse(reason: RangeProfileRefusal): RangeProfileParsing {
  return { outcome: "refused", reason };
}

export function parseRangeProfile(attributeValue: string): RangeProfileParsing {
  if (attributeValue.length > maximumRangeProfileLength) {
    return refuse("value too long");
  }
  if (attributeValue.length === 0) {
    return refuse("empty value");
  }
  const profile: Record<(typeof attackKinds)[number]["profileField"], number | undefined> = {
    meleeReach: undefined,
    rangedLongRange: undefined,
    cantripRange: undefined,
  };
  for (const entry of attributeValue.split(entrySeparator)) {
    const entryParts = entry.split(valueSeparator);
    const [kindToken, rangeText] = entryParts;
    if (entryParts.length !== 2 || kindToken === undefined || rangeText === undefined) {
      return refuse("malformed entry");
    }
    // Found in the table, never by indexing an object with the input, so a value such as
    // __proto__ cannot reach anything.
    const attackKind = attackKinds.find((candidateKind) => candidateKind.token === kindToken);
    if (attackKind === undefined) {
      return refuse("unknown attack kind");
    }
    if (profile[attackKind.profileField] !== undefined) {
      return refuse("repeated attack kind");
    }
    if (!rangePattern.test(rangeText)) {
      return refuse("invalid range");
    }
    profile[attackKind.profileField] = Number(rangeText);
  }
  return { outcome: "parsed", profile };
}

export function encodeRangeProfile(profile: AttackRangeProfile): string {
  return attackKinds
    .flatMap((attackKind) => {
      const range = profile[attackKind.profileField];
      return range === undefined ? [] : [`${attackKind.token}${valueSeparator}${String(range)}`];
    })
    .join(entrySeparator);
}

// FD4 keeps the profile in one character attribute that both products read. FF60 left its name
// to the implementation, and the prefix keeps it clear of every sheet's own attributes.
export const rangeProfileAttributeName = "fusion20_range";

// Players type this on a sheet, so spaces are forgiven before the strict grammar applies.
export function readRangeProfileValue(attributeValue: unknown): RangeProfileReading {
  if (attributeValue === undefined || attributeValue === null || attributeValue === "") {
    return { status: "missing" };
  }
  if (typeof attributeValue !== "string" || attributeValue.length > maximumRangeProfileLength * 2) {
    return { status: "malformed" };
  }
  const parsing = parseRangeProfile(attributeValue.replace(/\s/gu, ""));
  return parsing.outcome === "parsed" ? { status: "present", profile: parsing.profile } : { status: "malformed" };
}
