import type { Unsubscribe } from "@fusion20/shared/application";

// Roll20 has `on` but no way to remove a handler, so each event is registered once and fanned
// out here. A thrown error is caught per listener and reported, because an uncaught one can
// stop every script in the game (FF24).
export interface ListenerFanOut<Payload> {
  readonly subscribe: (listener: (payload: Payload) => void) => Unsubscribe;
  readonly deliver: (payload: Payload) => void;
}

export function describeThrown(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : "a value that is not an Error was thrown";
}

export function createListenerFanOut<Payload>(reportFailure: (reason: string) => void): ListenerFanOut<Payload> {
  const subscriptions = new Set<{ readonly listener: (payload: Payload) => void }>();
  return {
    subscribe: (listener) => {
      const subscription = { listener };
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
    deliver: (payload) => {
      for (const subscription of [...subscriptions]) {
        try {
          subscription.listener(payload);
        } catch (thrown) {
          reportFailure(describeThrown(thrown));
        }
      }
    },
  };
}
