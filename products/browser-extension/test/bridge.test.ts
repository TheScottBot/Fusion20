import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bridgeChannel,
  decodeBridgeMessage,
  encodeBridgeMessage,
  maximumBridgeMessageLength,
  maximumCategoryLength,
  maximumMissingCategories,
  type BridgeMessage,
} from "../src/bridge_envelope.ts";
import { createBridgeEndpoint, type BridgeEvent, type BridgeWindow } from "../src/bridge_transport.ts";

const pausedMessage: BridgeMessage = { kind: "page status", state: "paused", missing: ["walls", "turn order"] };

function envelopeWith(changes: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { ...encodeBridgeMessage(pausedMessage), ...changes };
}

describe("the bridge envelope", () => {
  it.each<BridgeMessage>([{ kind: "page status", state: "ready" }, pausedMessage])("round trips %j", (message) => {
    expect(decodeBridgeMessage(encodeBridgeMessage(message), "page to content")).toEqual({
      outcome: "accepted",
      message,
    });
  });

  it.each([
    ["anything without the channel", { hello: 1 }, "not a bridge message"],
    ["a value that is not an object", "fusion20-bridge", "not a bridge message"],
    ["an array", [bridgeChannel], "not a bridge message"],
    ["another version", envelopeWith({ version: 2 }), "unsupported version"],
    ["an extra field", envelopeWith({ extra: true }), "unexpected fields"],
    [
      "a missing field",
      { channel: bridgeChannel, version: 1, direction: "page to content", kind: "page status" },
      "unexpected fields",
    ],
    ["the other direction", envelopeWith({ direction: "content to page" }), "wrong direction"],
    ["an unknown kind", envelopeWith({ kind: "teleport" }), "unknown kind"],
    ["a kind named like an object's own property", envelopeWith({ kind: "__proto__" }), "unknown kind"],
    ["a payload that is not an object", envelopeWith({ payload: "paused" }), "invalid payload"],
    ["an unknown state", envelopeWith({ payload: { state: "asleep" } }), "invalid payload"],
    ["a ready state with extra fields", envelopeWith({ payload: { state: "ready", missing: [] } }), "invalid payload"],
    ["a pause naming nothing", envelopeWith({ payload: { state: "paused", missing: [] } }), "invalid payload"],
    [
      "a pause with an extra field",
      envelopeWith({ payload: { state: "paused", missing: ["walls"], why: 1 } }),
      "invalid payload",
    ],
    [
      "a category that is not plain words",
      envelopeWith({ payload: { state: "paused", missing: ["<b>x</b>"] } }),
      "invalid payload",
    ],
    ["a category that is not text", envelopeWith({ payload: { state: "paused", missing: [7] } }), "invalid payload"],
    [
      "too many categories",
      envelopeWith({
        payload: { state: "paused", missing: Array.from({ length: maximumMissingCategories + 1 }, () => "walls") },
      }),
      "invalid payload",
    ],
    [
      "a category over the bound",
      envelopeWith({ payload: { state: "paused", missing: ["a".repeat(maximumCategoryLength + 1)] } }),
      "invalid payload",
    ],
    [
      "a message over the size bound",
      envelopeWith({ padding: "x".repeat(maximumBridgeMessageLength) }),
      "message too large",
    ],
  ])("refuses %s", (_description, candidate, reason) => {
    expect(decodeBridgeMessage(candidate, "page to content")).toEqual({ outcome: "refused", reason });
  });

  it("accepts the most categories and the longest category the bounds allow", () => {
    const missing = Array.from({ length: maximumMissingCategories }, () => "a".repeat(maximumCategoryLength));
    expect(
      decodeBridgeMessage(envelopeWith({ payload: { state: "paused", missing } }), "page to content"),
    ).toMatchObject({
      outcome: "accepted",
    });
  });

  it("refuses a value that cannot be measured", () => {
    const cyclic: Record<string, unknown> = { channel: bridgeChannel };
    cyclic.self = cyclic;
    expect(decodeBridgeMessage(cyclic, "page to content")).toEqual({ outcome: "refused", reason: "message too large" });
  });

  it("never throws on arbitrary values", () => {
    fc.assert(
      fc.property(fc.anything(), (candidate) => {
        expect(["accepted", "refused"]).toContain(decodeBridgeMessage(candidate, "page to content").outcome);
      }),
      { numRuns: 3000 },
    );
  });
});

function createFakeWindow(origin = "https://app.roll20.net") {
  const listeners = new Set<(event: BridgeEvent) => void>();
  const fakeWindow: BridgeWindow & { deliver: (event: Partial<BridgeEvent>) => void } = {
    origin,
    postMessage: (envelope, targetOrigin) => {
      expect(targetOrigin).toBe(origin);
      fakeWindow.deliver({ messageValue: envelope });
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    deliver: (event) => {
      for (const listener of [...listeners]) {
        listener({ source: fakeWindow, origin, messageValue: undefined, ...event });
      }
    },
  };
  return fakeWindow;
}

describe("the bridge transport", () => {
  it("delivers a message from the page to the content script", () => {
    const fakeWindow = createFakeWindow();
    const received: BridgeMessage[] = [];
    createBridgeEndpoint(fakeWindow, "page to content", () => undefined).listen((message) => received.push(message));
    createBridgeEndpoint(fakeWindow, "content to page", () => undefined).send(pausedMessage);
    expect(received).toEqual([pausedMessage]);
  });

  it("ignores messages from another frame or origin, and ordinary page messages", () => {
    const fakeWindow = createFakeWindow();
    const received: BridgeMessage[] = [];
    const refusals: unknown[] = [];
    createBridgeEndpoint(fakeWindow, "page to content", (refusal) => refusals.push(refusal)).listen((message) =>
      received.push(message),
    );
    const envelope = encodeBridgeMessage(pausedMessage);
    fakeWindow.deliver({ messageValue: envelope, source: {} });
    fakeWindow.deliver({ messageValue: envelope, origin: "https://elsewhere.example" });
    fakeWindow.deliver({ messageValue: { type: "roll20 internal" } });
    expect([received, refusals]).toEqual([[], []]);
  });

  it("reports a refused bridge message without delivering it", () => {
    const fakeWindow = createFakeWindow();
    const refusals: unknown[] = [];
    const received: unknown[] = [];
    createBridgeEndpoint(fakeWindow, "page to content", (refusal) => refusals.push(refusal)).listen((message) =>
      received.push(message),
    );
    fakeWindow.deliver({ messageValue: envelopeWith({ version: 9 }) });
    expect([received, refusals]).toEqual([[], [{ outcome: "refused", reason: "unsupported version" }]]);
  });

  it("stops delivering once the listener is removed", () => {
    const fakeWindow = createFakeWindow();
    const received: unknown[] = [];
    const stopListening = createBridgeEndpoint(fakeWindow, "page to content", () => undefined).listen((message) =>
      received.push(message),
    );
    stopListening();
    fakeWindow.deliver({ messageValue: encodeBridgeMessage(pausedMessage) });
    expect(received).toEqual([]);
  });
});
