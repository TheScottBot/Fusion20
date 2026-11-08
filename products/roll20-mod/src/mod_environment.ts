// The Mod globals this product uses, gathered in one value. Only main.ts reads the real globals,
// so every adapter runs unchanged against the fake sandbox in the tests (section 2).

export interface ModObject {
  readonly id: string;
  readonly get: (propertyName: string) => unknown;
  readonly set: (attributes: Readonly<Record<string, unknown>>) => void;
}

export type ModEventListener = (...eventArguments: readonly unknown[]) => void;

export interface ModEnvironment {
  readonly on: (eventName: string, listener: ModEventListener) => void;
  readonly findObjs: (attributes: Readonly<Record<string, unknown>>) => readonly ModObject[];
  readonly getObj: (objectType: string, id: string) => ModObject | undefined;
  readonly createObj: (objectType: string, attributes: Readonly<Record<string, unknown>>) => ModObject | undefined;
  readonly sendChat: (speaker: string, messageText: string) => void;
  readonly log: (lineText: string) => void;
  readonly playerIsGM: (playerId: string) => boolean;
  readonly campaign: () => ModObject;
  readonly now: () => number;
}
