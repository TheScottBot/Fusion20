// The messages between the page's world and the isolated content script. Any script on the page
// can post the same shape (FF17), so everything arriving is untrusted: bounded, versioned, with
// exactly the expected fields, and checked against one table of kinds (datum 0.7).

import { isRecord, measureSerialisedLength } from "@fusion20/shared/roll20";

export const bridgeChannel = "fusion20-bridge";
export const bridgeVersion = 1;
// Generous for a battlefield of a few hundred objects, and small enough that a hostile post
// cannot cost much to refuse (FF101).
export const maximumBridgeMessageLength = 200_000;
export const maximumMissingCategories = 10;
export const maximumCategoryLength = 40;

export type BridgeDirection = "page to content" | "content to page";

export type BridgeMessage =
  | { readonly kind: "page status"; readonly state: "ready" }
  | { readonly kind: "page status"; readonly state: "paused"; readonly missing: readonly string[] };

export type BridgeRefusal =
  | "not a bridge message"
  | "message too large"
  | "unsupported version"
  | "unexpected fields"
  | "wrong direction"
  | "unknown kind"
  | "invalid payload";

export type BridgeDecoding =
  | { readonly outcome: "accepted"; readonly message: BridgeMessage }
  | { readonly outcome: "refused"; readonly reason: BridgeRefusal };

type UntrustedRecord = Readonly<Record<string, unknown>>;

function hasExactly(candidate: UntrustedRecord, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(candidate);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(candidate, key));
}

const categoryPattern = new RegExp(`^[a-z][a-z ]{0,${String(maximumCategoryLength - 1)}}$`, "u");

function readPageStatus(payload: UntrustedRecord): BridgeMessage | undefined {
  if (payload.state === "ready" && hasExactly(payload, ["state"])) {
    return { kind: "page status", state: "ready" };
  }
  const { missing } = payload;
  if (
    payload.state !== "paused" ||
    !hasExactly(payload, ["state", "missing"]) ||
    !Array.isArray(missing) ||
    missing.length === 0 ||
    missing.length > maximumMissingCategories ||
    !missing.every((category) => typeof category === "string" && categoryPattern.test(category))
  ) {
    return undefined;
  }
  return { kind: "page status", state: "paused", missing: missing as readonly string[] };
}

// One row per kind: which way it travels and how its payload is read.
const kindRows: readonly {
  readonly kind: BridgeMessage["kind"];
  readonly direction: BridgeDirection;
  readonly readPayload: (payload: UntrustedRecord) => BridgeMessage | undefined;
}[] = [{ kind: "page status", direction: "page to content", readPayload: readPageStatus }];

const envelopeKeys = ["channel", "version", "direction", "kind", "payload"] as const;

const directionByKind = Object.fromEntries(kindRows.map((row) => [row.kind, row.direction])) as Readonly<
  Record<BridgeMessage["kind"], BridgeDirection>
>;

export function encodeBridgeMessage(message: BridgeMessage): UntrustedRecord {
  const { kind, ...payload } = message;
  return { channel: bridgeChannel, version: bridgeVersion, direction: directionByKind[kind], kind, payload };
}

function refuse(reason: BridgeRefusal): BridgeDecoding {
  return { outcome: "refused", reason };
}

export function decodeBridgeMessage(candidate: unknown, expectedDirection: BridgeDirection): BridgeDecoding {
  if (!isRecord(candidate) || candidate.channel !== bridgeChannel) {
    return refuse("not a bridge message");
  }
  const length = measureSerialisedLength(candidate);
  if (length === undefined || length > maximumBridgeMessageLength) {
    return refuse("message too large");
  }
  if (candidate.version !== bridgeVersion) {
    return refuse("unsupported version");
  }
  if (!hasExactly(candidate, envelopeKeys)) {
    return refuse("unexpected fields");
  }
  if (candidate.direction !== expectedDirection) {
    return refuse("wrong direction");
  }
  // Found in the table, never by indexing an object with the input.
  const kindRow = kindRows.find((row) => row.kind === candidate.kind && row.direction === expectedDirection);
  if (kindRow === undefined) {
    return refuse("unknown kind");
  }
  const message = isRecord(candidate.payload) ? kindRow.readPayload(candidate.payload) : undefined;
  return message === undefined ? refuse("invalid payload") : { outcome: "accepted", message };
}
