import { buildBeyond20Message, buildDigitalInlineRoll } from "@fusion20/shared/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { installFusion20Mod } from "../src/fusion20_mod.ts";
import { buildPartyOnPage, createFakeModEnvironment, type FakeModEnvironment } from "./fake_mod_environment.ts";

let fake: FakeModEnvironment;
let installed: ReturnType<typeof installFusion20Mod>;

function rollFrom(characterName: string, playerId: string, naturalD20: number): void {
  fake.emit(
    "chat:message",
    buildBeyond20Message({
      characterName,
      playerId,
      inlineRolls: [buildDigitalInlineRoll(naturalD20, naturalD20 >= 18 ? "critical" : "none")],
    }),
  );
}

function command(playerId: string, commandText: string): void {
  fake.emit("chat:message", { type: "api", playerid: playerId, content: commandText });
}

function chainIdOfFirstPrompt(): string {
  const [prompt] = fake.readWhispers('"Niamh\'s Player"');
  return /chain=([\w-]+)/u.exec(prompt ?? "")?.[1] ?? "";
}

function loggedJson(): readonly Record<string, unknown>[] {
  return fake.loggedLines.map((line) => JSON.parse(line.replace(/^Fusion20 /u, "")) as Record<string, unknown>);
}

beforeEach(() => {
  fake = createFakeModEnvironment();
  buildPartyOnPage(fake);
  installed = installFusion20Mod(fake.environment, { allyMarker: "green" });
  fake.emit("ready");
});

describe("the Mod at sandbox start", () => {
  it("does nothing before Roll20 says the campaign is ready", () => {
    const early = createFakeModEnvironment();
    installFusion20Mod(early.environment, { allyMarker: undefined });
    expect([early.listenerCount("chat:message"), early.loggedLines]).toEqual([0, []]);
  });

  it("logs its version, lighting per page, the ally marker and characters with no range, then the coordinator's line", () => {
    const restarted = createFakeModEnvironment();
    restarted.addPlayerPage();
    restarted.addObject("character", { name: "Rangeless", controlledby: "player-x" });
    restarted.addObject("character", { name: "Monster", controlledby: "" });
    installFusion20Mod(restarted.environment, { allyMarker: undefined });
    restarted.emit("ready");
    const lines = restarted.loggedLines.map((line) => JSON.parse(line.replace(/^Fusion20 /u, "")) as unknown);
    expect(lines).toEqual([
      {
        kind: "mod startup",
        version: "0.0.0",
        pages: [{ page: expect.any(String) as string, lighting: "on" }],
        allyMarker: "none",
        playerCharacters: 1,
        playerCharactersWithoutRange: 1,
      },
      { kind: "startup", mode: "leader", lighting: "on" },
    ]);
  });

  it("reports lighting off on a page without it", () => {
    expect(loggedJson()[0]).toMatchObject({
      pages: [{ lighting: "off" }],
      allyMarker: "green",
      playerCharactersWithoutRange: 0,
    });
  });
});

describe("a chain through the Mod", () => {
  it("announces a critical and whispers the roller a target button", () => {
    rollFrom("Niamh", "player-niamh", 20);
    const chainId = chainIdOfFirstPrompt();
    expect(chainId).toMatch(/^[a-z0-9]+-1$/u);
    expect(fake.readPublic()).toEqual([`Niamh rolled a fusion critical&#33; [f20:1:started:${chainId}:-Ntokenniamh]`]);
    expect(fake.readWhispers('"Niamh\'s Player"')[0]).toContain("token=&#64;{target|token_id}");
  });

  it("offers partners once a target is picked, then announces a nomination and the end", () => {
    rollFrom("Niamh", "player-niamh", 20);
    const chainId = chainIdOfFirstPrompt();
    command("player-niamh", `!fusion20 target chain=${chainId} token=-Ntokengoblin`);
    expect(fake.readWhispers('"Niamh\'s Player"')[1]).toContain(
      `[FighterMan](!fusion20 nominate chain=${chainId} partner=-Ntokenfighter)`,
    );
    command("player-niamh", `!fusion20 nominate chain=${chainId} partner=-Ntokenfighter`);
    rollFrom("FighterMan", "player-fighter", 7);
    expect(fake.readPublic().slice(1)).toEqual([
      `The fusion chain targets Goblin. [f20:1:target:${chainId}:-Ntokengoblin]`,
      `Niamh nominates FighterMan to attack Goblin. [f20:1:nominated:${chainId}:-Ntokenniamh:-Ntokenfighter:-Ntokengoblin]`,
      `The fusion chain ends: that attack was not a critical. [f20:1:ended:${chainId}:partner-attack]`,
    ]);
  });

  it("starts the chain once the poster picks which of the character's tokens rolled (FF91)", () => {
    const page = fake.environment.campaign().get("playerpageid") as string;
    fake.addToken(page, "-Ntokenniamhtwo", { name: "Niamh", represents: "-Ncharniamh" });
    rollFrom("Niamh", "player-niamh", 20);
    expect(fake.readPublic()).toEqual([]);
    const rollId = /roll=([\w-]+)/u.exec(fake.readWhispers('"Niamh\'s Player"')[0] ?? "")?.[1] ?? "";
    expect(rollId).toMatch(/^r[a-z0-9]+-1$/u);
    command("player-niamh", `!fusion20 roller roll=${rollId} token=-Ntokenniamhtwo`);
    expect(fake.readPublic()).toEqual([expect.stringMatching(/:started:[\w-]+:-Ntokenniamhtwo\]$/u)]);
    expect(installed.readCoordinator()?.readCounters().refusedCommands).toEqual({});
  });

  it("refuses a target from another player and logs the refusal", () => {
    rollFrom("Niamh", "player-niamh", 20);
    command("player-fighter", `!fusion20 target chain=${chainIdOfFirstPrompt()} token=-Ntokengoblin`);
    expect(loggedJson().at(-1)).toEqual({ kind: "refused command", reason: "not authorised" });
    expect(installed.readCoordinator()?.readCounters().refusedCommands).toEqual({ "not authorised": 1 });
  });

  it("ends the chain when the turn moves on (FD9)", () => {
    rollFrom("Niamh", "player-niamh", 20);
    fake.environment.campaign().set({ turnorder: JSON.stringify([{ id: "-Ntokengoblin" }]) });
    fake.emit("change:campaign:turnorder", fake.environment.campaign(), {
      turnorder: JSON.stringify([{ id: "-Ntokenniamh" }]),
    });
    expect(fake.readPublic().at(-1)).toMatch(/turn moves on\. \[f20:1:ended:[\w-]+:turn-order\]$/u);
  });

  it("stamps chain ids with the start time, so a restarted sandbox never reuses one (FF22)", () => {
    const later = createFakeModEnvironment();
    later.setNow(1_800_000_000_000);
    buildPartyOnPage(later);
    installFusion20Mod(later.environment, { allyMarker: undefined });
    later.emit("ready");
    later.emit(
      "chat:message",
      buildBeyond20Message({
        characterName: "Niamh",
        playerId: "player-niamh",
        inlineRolls: [buildDigitalInlineRoll(20, "critical")],
      }),
    );
    rollFrom("Niamh", "player-niamh", 20);
    const laterChainId = /chain=([\w-]+)/u.exec(later.readWhispers('"Niamh\'s Player"')[0] ?? "")?.[1];
    expect(laterChainId).toMatch(/-1$/u);
    expect(laterChainId).not.toBe(chainIdOfFirstPrompt());
  });

  it("logs an error thrown while handling a message instead of letting it out (FF24)", () => {
    const workingFindObjs = fake.environment.findObjs;
    Object.assign(fake.environment, {
      findObjs: () => {
        throw new Error("sandbox broke");
      },
    });
    expect(() => {
      rollFrom("Niamh", "player-niamh", 20);
    }).not.toThrow();
    Object.assign(fake.environment, { findObjs: workingFindObjs });
    expect(loggedJson().at(-1)).toEqual({ kind: "adapter failure", port: "chat message", reason: "sandbox broke" });
  });
});

describe("setting a range by command (FD4)", () => {
  it("creates the attribute for a player's own character and whispers the result", () => {
    fake.addObject("character", { name: "Newcomer", controlledby: "player-fighter" }, "-Ncharnew");
    command("player-fighter", "!fusion20 range character=-Ncharnew value=melee=10,ranged=60");
    expect(fake.environment.findObjs({ _type: "attribute", _characterid: "-Ncharnew" })[0]?.get("current")).toBe(
      "melee=10,ranged=60",
    );
    expect(fake.readWhispers('"Fighter Player"')).toEqual([
      "The fusion20 range for Newcomer is now melee&#61;10,ranged&#61;60.",
    ]);
  });

  it("updates an existing attribute rather than adding a second", () => {
    fake.makeGameMaster("player-gm");
    command("player-gm", "!fusion20 range character=-Ncharniamh value=melee=10");
    const attributes = fake.environment.findObjs({ _type: "attribute", _characterid: "-Ncharniamh" });
    expect(attributes.map((attribute) => attribute.get("current"))).toEqual(["melee=10"]);
    expect(fake.readWhispers("gm")).toHaveLength(1);
  });

  it.each([
    [
      "another player's character",
      "!fusion20 range character=-Ncharniamh value=melee=10",
      "Only a player who controls",
    ],
    [
      "a character that does not exist",
      "!fusion20 range character=-Nnobody value=melee=10",
      "No character has that id.",
    ],
  ])("refuses %s and leaves it unchanged", (_description, commandText, replyStart) => {
    command("player-fighter", commandText);
    expect(fake.readWhispers('"Fighter Player"')[0]).toMatch(new RegExp(`^${replyStart}`, "u"));
    expect(fake.environment.findObjs({ _type: "attribute", _characterid: "-Ncharniamh" })[0]?.get("current")).toBe(
      "melee=5",
    );
  });

  it("does not pass range commands to the coordinator as refused", () => {
    command("player-fighter", "!fusion20 range character=-Ncharfighter value=melee=10");
    expect(installed.readCoordinator()?.readCounters().refusedCommands).toEqual({});
  });
});
