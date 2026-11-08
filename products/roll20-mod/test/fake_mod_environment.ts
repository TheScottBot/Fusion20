import { roll20PageProperties, roll20TokenProperties } from "@fusion20/shared/testing";
import type { ModEnvironment, ModEventListener, ModObject } from "../src/mod_environment.ts";

// A stand in for the Roll20 sandbox, holding objects the way the Mod API presents them. Roll20
// accepts a read only property with or without its leading underscore, and so does this.

function withoutUnderscore(propertyName: string): string {
  return propertyName.startsWith("_") ? propertyName.slice(1) : propertyName;
}

function normaliseAttributes(attributes: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attributes).map(([name, value]) => [withoutUnderscore(name), value]));
}

export interface PostedChat {
  readonly speaker: string;
  readonly messageText: string;
}

// What a player sees once chat has turned character references back into characters.
export function decodeCharacterReferences(text: string): string {
  return text.replace(/&#(\d+);/gu, (_reference, codePoint: string) => String.fromCodePoint(Number(codePoint)));
}

export function createFakeModEnvironment() {
  const objects: { readonly modObject: ModObject; readonly attributes: Record<string, unknown> }[] = [];
  const listenersByEvent = new Map<string, ModEventListener[]>();
  const postedChat: PostedChat[] = [];
  const loggedLines: string[] = [];
  const gameMasters = new Set<string>();
  let currentTime = 1_700_000_000_000;
  let createdCount = 0;

  const emit = (eventName: string, ...eventArguments: readonly unknown[]): void => {
    for (const listener of listenersByEvent.get(eventName) ?? []) {
      listener(...eventArguments);
    }
  };

  const addObject = (objectType: string, attributes: Readonly<Record<string, unknown>>, id?: string): ModObject => {
    createdCount += 1;
    const storedAttributes: Record<string, unknown> = { ...normaliseAttributes(attributes), type: objectType };
    const modObject: ModObject = {
      id: id ?? `-Nfake${String(createdCount)}`,
      get: (propertyName) => storedAttributes[withoutUnderscore(propertyName)],
      set: (changes) => {
        Object.assign(storedAttributes, normaliseAttributes(changes));
      },
    };
    objects.push({ modObject, attributes: storedAttributes });
    return modObject;
  };

  const campaign = addObject("campaign", { turnorder: "", playerpageid: "" }, "root");

  const environment: ModEnvironment = {
    on: (eventName, listener) => {
      listenersByEvent.set(eventName, [...(listenersByEvent.get(eventName) ?? []), listener]);
    },
    findObjs: (wanted) => {
      const wantedEntries = Object.entries(normaliseAttributes(wanted));
      return objects
        .filter(({ attributes }) => wantedEntries.every(([name, value]) => attributes[name] === value))
        .map(({ modObject }) => modObject);
    },
    getObj: (objectType, id) =>
      objects.find(({ modObject, attributes }) => modObject.id === id && attributes.type === objectType)?.modObject,
    createObj: (objectType, attributes) => addObject(objectType, attributes),
    // Like Roll20, a script's own message comes back to every chat listener with player id API.
    sendChat: (speaker, messageText) => {
      postedChat.push({ speaker, messageText });
      const isCommand = messageText.startsWith("!");
      emit("chat:message", {
        type: isCommand ? "api" : "general",
        playerid: "API",
        who: speaker,
        content: messageText,
      });
    },
    log: (lineText) => {
      loggedLines.push(lineText);
    },
    playerIsGM: (playerId) => gameMasters.has(playerId),
    campaign: () => campaign,
    now: () => currentTime,
  };

  return {
    environment,
    emit,
    addObject,
    postedChat,
    loggedLines,
    listenerCount: (eventName: string) => listenersByEvent.get(eventName)?.length ?? 0,
    makeGameMaster: (playerId: string) => gameMasters.add(playerId),
    setNow: (milliseconds: number) => {
      currentTime = milliseconds;
    },
    addPlayer: (playerId: string, displayName: string) => addObject("player", { _displayname: displayName }, playerId),
    addPlayerPage: (overrides: Readonly<Record<string, unknown>> = {}) => {
      const page = addObject("page", { ...roll20PageProperties, ...overrides });
      campaign.set({ playerpageid: page.id });
      return page;
    },
    addToken: (pageId: string, id: string, overrides: Readonly<Record<string, unknown>> = {}) =>
      addObject("graphic", { ...roll20TokenProperties, _pageid: pageId, ...overrides }, id),
    readWhispers: (whisperTarget: string) =>
      postedChat
        .filter(({ messageText }) => messageText.startsWith(`/w ${whisperTarget} `))
        .map(({ messageText }) => messageText.slice(`/w ${whisperTarget} `.length)),
    readPublic: () =>
      postedChat.filter(({ messageText }) => !messageText.startsWith("/w ")).map(({ messageText }) => messageText),
  };
}

export type FakeModEnvironment = ReturnType<typeof createFakeModEnvironment>;

// A party on the fake player page: Niamh controlled by player-niamh, FighterMan by
// player-fighter, the Goblin controlled by nobody, each one square apart in a row.
export function buildPartyOnPage(fake: FakeModEnvironment) {
  const page = fake.addPlayerPage({ dynamic_lighting_enabled: false });
  fake.addPlayer("player-niamh", "Niamh's Player");
  fake.addPlayer("player-fighter", "Fighter Player");
  const niamh = fake.addObject("character", { name: "Niamh", controlledby: "player-niamh" }, "-Ncharniamh");
  const fighter = fake.addObject("character", { name: "FighterMan", controlledby: "player-fighter" }, "-Ncharfighter");
  for (const [character, profile] of [
    [niamh, "melee=5"],
    [fighter, "melee=5"],
  ] as const) {
    fake.addObject("attribute", { _characterid: character.id, name: "fusion20_range", current: profile });
  }
  fake.addToken(page.id, "-Ntokenniamh", { name: "Niamh", represents: niamh.id, left: 35, top: 35 });
  fake.addToken(page.id, "-Ntokengoblin", { name: "Goblin", left: 105, top: 35 });
  fake.addToken(page.id, "-Ntokenfighter", { name: "FighterMan", represents: fighter.id, left: 175, top: 35 });
  return { page, niamh, fighter };
}
