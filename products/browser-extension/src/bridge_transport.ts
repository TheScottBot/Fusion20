import {
  decodeBridgeMessage,
  encodeBridgeMessage,
  type BridgeDecoding,
  type BridgeDirection,
  type BridgeMessage,
} from "./bridge_envelope.ts";

// The part of a window the bridge uses, so tests run without a browser. The real window's
// message event calls the value `data`, which the wiring maps to messageValue.
export interface BridgeWindow {
  readonly origin: string;
  readonly postMessage: (envelope: unknown, targetOrigin: string) => void;
  readonly addEventListener: (type: "message", listener: (event: BridgeEvent) => void) => void;
  readonly removeEventListener: (type: "message", listener: (event: BridgeEvent) => void) => void;
}

export interface BridgeEvent {
  readonly source: unknown;
  readonly origin: string;
  readonly messageValue: unknown;
}

export interface BridgeEndpoint {
  readonly send: (message: BridgeMessage) => void;
  readonly listen: (listener: (message: BridgeMessage) => void) => () => void;
}

// Both worlds share the window, so posting to its own origin is how they talk. Only messages
// from this window and origin are read, and other pages' frames are ignored. That still cannot
// tell our page script from any other script on the page (FF17).
export function createBridgeEndpoint(
  bridgeWindow: BridgeWindow,
  receives: BridgeDirection,
  reportRefusal: (decoding: Extract<BridgeDecoding, { outcome: "refused" }>) => void,
): BridgeEndpoint {
  return {
    send: (message) => {
      bridgeWindow.postMessage(encodeBridgeMessage(message), bridgeWindow.origin);
    },
    listen: (listener) => {
      const onMessage = (event: BridgeEvent): void => {
        if (event.source !== bridgeWindow || event.origin !== bridgeWindow.origin) {
          return;
        }
        const decoding = decodeBridgeMessage(event.messageValue, receives);
        if (decoding.outcome === "accepted") {
          listener(decoding.message);
        } else if (decoding.reason !== "not a bridge message") {
          reportRefusal(decoding);
        }
      };
      bridgeWindow.addEventListener("message", onMessage);
      return () => {
        bridgeWindow.removeEventListener("message", onMessage);
      };
    },
  };
}
