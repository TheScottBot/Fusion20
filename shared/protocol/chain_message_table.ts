import {
  chainEndOrigins,
  chainEndReasonByOrigin,
  type ChainEndOrigin,
  type ChainEvent,
} from "../domain/fusion_chain.ts";
import { isWireIdentifier, maximumIdentifierLength } from "./wire_identifier.ts";

export type ChainMessageRefusal =
  | "message too long"
  | "not a chain message"
  | "unsupported version"
  | "unknown message"
  | "wrong field count"
  | "invalid value";

export type ChainMessageParsing =
  | { readonly outcome: "parsed"; readonly chainEvent: ChainEvent }
  | { readonly outcome: "refused"; readonly reason: ChainMessageRefusal };

const protocolName = "f20";
const protocolVersion = "1";
const fieldSeparator = ":";
const tagOpening = `[${protocolName}${fieldSeparator}`;
const tagClosing = "]";
const sentenceSeparator = " ";

// Not read from Roll20, which documents no chat limit. Generous for a sentence of three names.
const maximumSentenceLength = 500;

// One table, from which the parser and the encoder both derive (datum 0.7). A chain end carries
// only its origin on the wire, since the domain derives the reason from it, so the two cannot
// disagree in a message.
const chainMessageRows = [
  { kind: "chain started", wireName: "started", fields: ["originalRoller"] },
  { kind: "target selected", wireName: "target", fields: ["target"] },
  { kind: "partner nominated", wireName: "nominated", fields: ["nominator", "partner", "target"] },
  { kind: "partner attack qualified", wireName: "qualified", fields: ["partner", "nextNominator"] },
  { kind: "chain ended", wireName: "ended", fields: ["origin"] },
] as const satisfies readonly {
  readonly kind: ChainEvent["kind"];
  readonly wireName: string;
  readonly fields: readonly string[];
}[];

export const chainMessageWireNames: readonly string[] = chainMessageRows.map(({ wireName }) => wireName);

export function encodeChainEndOrigin(origin: ChainEndOrigin): string {
  return originToWire(origin);
}

const headerFieldCount = 4;
const longestFieldList = Math.max(...chainMessageRows.map((row) => row.fields.length));

export const maximumChainMessageLength =
  maximumSentenceLength +
  sentenceSeparator.length +
  tagOpening.length +
  tagClosing.length +
  (headerFieldCount + longestFieldList) * (maximumIdentifierLength + fieldSeparator.length);

function refuse(reason: ChainMessageRefusal): ChainMessageParsing {
  return { outcome: "refused", reason };
}

function originToWire(origin: ChainEndOrigin): string {
  return origin.replaceAll(" ", "-");
}

function originFromWire(wireOrigin: string): ChainEndOrigin | undefined {
  return chainEndOrigins.find((origin) => originToWire(origin) === wireOrigin);
}

export function parseChainMessage(messageText: string): ChainMessageParsing {
  if (messageText.length > maximumChainMessageLength) {
    return refuse("message too long");
  }
  // Only the last word counts, so a character named like a tag stays part of the sentence.
  const tag = messageText.slice(messageText.lastIndexOf(sentenceSeparator) + sentenceSeparator.length);
  if (!tag.startsWith(tagOpening) || !tag.endsWith(tagClosing)) {
    return refuse("not a chain message");
  }
  const tagBody = tag.slice(tagOpening.length, -tagClosing.length);
  const [version, wireName, chainId, ...fieldValues] = tagBody.split(fieldSeparator);
  if (version !== protocolVersion) {
    return refuse("unsupported version");
  }
  const messageRow = chainMessageRows.find((candidateRow) => candidateRow.wireName === wireName);
  if (messageRow === undefined) {
    return refuse("unknown message");
  }
  if (chainId === undefined || fieldValues.length !== messageRow.fields.length) {
    return refuse("wrong field count");
  }
  if (!isWireIdentifier(chainId)) {
    return refuse("invalid value");
  }
  if (messageRow.kind === "chain ended") {
    const origin = originFromWire(fieldValues[0] ?? "");
    if (origin === undefined) {
      return refuse("invalid value");
    }
    const reason = chainEndReasonByOrigin[origin];
    return { outcome: "parsed", chainEvent: { kind: messageRow.kind, chainId, origin, reason } };
  }
  if (!fieldValues.every(isWireIdentifier)) {
    return refuse("invalid value");
  }
  const namedFields = messageRow.fields.map((field: string, fieldIndex) => [field, fieldValues[fieldIndex]]);
  // Field names came from the table and the count was checked, which is what the type says.
  const chainEvent = { kind: messageRow.kind, chainId, ...Object.fromEntries(namedFields) } as ChainEvent;
  return { outcome: "parsed", chainEvent };
}

export function encodeChainMessage(chainEvent: ChainEvent, sentence: string): string {
  const messageRow = chainMessageRows.find((candidateRow) => candidateRow.kind === chainEvent.kind);
  const eventFields: Readonly<Record<string, string>> =
    chainEvent.kind === "chain ended" ? { origin: originToWire(chainEvent.origin) } : chainEvent;
  const fieldValues = (messageRow?.fields ?? []).map((field: string) => eventFields[field] ?? "");
  const tagBody = [protocolVersion, messageRow?.wireName ?? "", chainEvent.chainId, ...fieldValues];
  return `${sentence}${sentenceSeparator}${tagOpening}${tagBody.join(fieldSeparator)}${tagClosing}`;
}
