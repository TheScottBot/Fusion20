import type { BattlefieldSource } from "@fusion20/shared/application";
import { interpretBattlefield, isAlly } from "@fusion20/shared/roll20";
import type { ModEnvironment } from "./mod_environment.ts";
import { nameOfToken, readCharacterControllers, readPlayerPage } from "./token_records.ts";

export function createModBattlefieldSource(
  environment: ModEnvironment,
  allyMarker: string | undefined,
): BattlefieldSource {
  return {
    readBattlefield: () => {
      const page = readPlayerPage(environment);
      if (page === undefined) {
        return { outcome: "unavailable", reason: "no player page" };
      }
      const onPage = (objectType: string) => environment.findObjs({ _type: objectType, _pageid: page.id });
      const interpretation = interpretBattlefield(page, {
        paths: onPage("pathv2"),
        doors: onPage("door"),
        windows: onPage("window"),
        graphics: onPage("graphic"),
      });
      if (interpretation.outcome === "unusable") {
        return { outcome: "unavailable", reason: interpretation.reason };
      }
      const { grid, scene, tokens } = interpretation.battlefield;
      const lookUpCharacterPlayers = (characterId: string) => readCharacterControllers(environment, characterId);
      return {
        outcome: "read",
        snapshot: {
          grid,
          scene,
          combatants: tokens.map((token) => ({
            reference: token.id,
            displayName: nameOfToken(environment, token.id),
            isAlly: isAlly(token, lookUpCharacterPlayers, allyMarker),
            footprint: token.footprint,
            sightTarget: token.sightTarget,
            viewer: token.viewer,
          })),
        },
      };
    },
  };
}
