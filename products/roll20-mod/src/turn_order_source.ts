import type { TurnOrderSource } from "@fusion20/shared/application";
import { hasTurnOrderAdvanced } from "@fusion20/shared/roll20";
import type { ListenerFanOut } from "./listener_fan_out.ts";
import type { ModObject } from "./mod_environment.ts";

export interface TurnOrderChange {
  readonly campaign: ModObject;
  readonly previous: unknown;
}

// Roll20 passes the campaign and its previous attributes. A script's own set raises no event
// (FF20), and this product never writes the turn order.
export function createModTurnOrderSource(turnOrderChanges: ListenerFanOut<TurnOrderChange>): TurnOrderSource {
  return {
    subscribe: (listener) =>
      turnOrderChanges.subscribe(({ campaign, previous }) => {
        const previousTurnOrder: unknown = (previous as { turnorder?: unknown } | null | undefined)?.turnorder;
        if (hasTurnOrderAdvanced(previousTurnOrder, campaign.get("turnorder"))) {
          listener();
        }
      }),
  };
}
