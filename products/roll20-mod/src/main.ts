import type { ModEventListener, ModObject } from "./mod_environment.ts";
import { installFusion20Mod } from "./fusion20_mod.ts";

// The Roll20 Mod globals, read here and nowhere else.
declare const on: (eventName: string, listener: ModEventListener) => void;
declare const findObjs: (attributes: Readonly<Record<string, unknown>>) => ModObject[];
declare const getObj: (objectType: string, id: string) => ModObject | undefined;
declare const createObj: (objectType: string, attributes: Readonly<Record<string, unknown>>) => ModObject | undefined;
declare const sendChat: (speaker: string, messageText: string) => void;
declare const log: (lineText: string) => void;
declare const playerIsGM: (playerId: string) => boolean;
declare const Campaign: () => ModObject;

// FD3: green is one of Roll20's built in status markers, and the GM can see it on the map (FF92).
const defaultAllyMarker = "green";

installFusion20Mod(
  {
    on: (eventName, listener) => {
      on(eventName, listener);
    },
    findObjs: (attributes) => findObjs(attributes),
    getObj: (objectType, id) => getObj(objectType, id),
    createObj: (objectType, attributes) => createObj(objectType, attributes),
    sendChat: (speaker, messageText) => {
      sendChat(speaker, messageText);
    },
    log: (lineText) => {
      log(lineText);
    },
    playerIsGM: (playerId) => playerIsGM(playerId),
    campaign: () => Campaign(),
    now: () => Date.now(),
  },
  { allyMarker: defaultAllyMarker },
);
