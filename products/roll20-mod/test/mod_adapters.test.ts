import {
  buildBeyond20Message,
  buildDigitalInlineRoll,
  describeAnnouncerContract,
  describePrompterContract,
  describeSourceContract,
} from "@fusion20/shared/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { createModBattlefieldSource } from "../src/battlefield_source.ts";
import { createModAnnouncer, createModPrompter, escapeChatText } from "../src/chat_output.ts";
import { createModAttackRollSource, createModCommandSource, routeCommand } from "../src/chat_sources.ts";
import { createHeldRolls, maximumHeldRolls } from "../src/held_rolls.ts";
import { createModActorAuthority, createModRangeProfileSource } from "../src/character_records.ts";
import { createListenerFanOut } from "../src/listener_fan_out.ts";
import { createModTurnOrderSource, type TurnOrderChange } from "../src/turn_order_source.ts";
import {
  buildPartyOnPage,
  createFakeModEnvironment,
  decodeCharacterReferences,
  type FakeModEnvironment,
} from "./fake_mod_environment.ts";

function wireChat(fake: FakeModEnvironment) {
  const failures: string[] = [];
  const chatMessages = createListenerFanOut<unknown>((reason) => failures.push(reason));
  fake.environment.on("chat:message", (message) => {
    chatMessages.deliver(message);
  });
  return { chatMessages, failures };
}

function testRollOptions() {
  let rollNumber = 0;
  return {
    createRollId: () => {
      rollNumber += 1;
      return `r${String(rollNumber)}`;
    },
    reportFailure: () => undefined,
  };
}

function criticalFrom(characterName: string, playerId: string, naturalD20 = 20) {
  return buildBeyond20Message({
    characterName,
    playerId,
    inlineRolls: [buildDigitalInlineRoll(naturalD20, naturalD20 >= 18 ? "critical" : "none")],
  });
}

describeSourceContract("Mod attack roll", () => {
  const fake = createFakeModEnvironment();
  buildPartyOnPage(fake);
  const { chatMessages } = wireChat(fake);
  return {
    subscribe: createModAttackRollSource(fake.environment, chatMessages, testRollOptions()).subscribe,
    produceSample: () => {
      fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    },
  };
});

describeSourceContract("Mod chain command", () => {
  const fake = createFakeModEnvironment();
  const { chatMessages } = wireChat(fake);
  return {
    subscribe: createModCommandSource(chatMessages, "chain").subscribe,
    produceSample: () => {
      fake.emit("chat:message", { type: "api", playerid: "player-niamh", content: "!fusion20 end chain=c1" });
    },
  };
});

describeAnnouncerContract("Mod", () => {
  const fake = createFakeModEnvironment();
  return {
    announcer: createModAnnouncer(fake.environment),
    readAnnounced: () => fake.readPublic().map(decodeCharacterReferences),
  };
});

describePrompterContract("Mod", () => {
  const fake = createFakeModEnvironment();
  fake.addPlayer("player-roller", "Roller Player");
  fake.addObject("graphic", { name: "Roller", controlledby: "player-roller" }, "roller");
  const chainsIn = (pattern: RegExp) =>
    fake.readWhispers('"Roller Player"').flatMap((whisper) => pattern.exec(whisper)?.slice(1, 2) ?? []);
  return {
    prompter: createModPrompter(fake.environment),
    readTargetPromptChains: () => chainsIn(/!fusion20 target chain=([\w-]+)/u),
    readPartnerPromptChains: () =>
      fake
        .readWhispers('"Roller Player"')
        .filter((whisper) => !whisper.includes("!fusion20 target"))
        .flatMap((whisper) => /!fusion20 end chain=([\w-]+)/u.exec(whisper)?.slice(1, 2) ?? []),
  };
});

describeSourceContract("Mod turn order", () => {
  const turnOrderChanges = createListenerFanOut<TurnOrderChange>(() => undefined);
  const fake = createFakeModEnvironment();
  let entryNumber = 0;
  return {
    subscribe: (listener) =>
      createModTurnOrderSource(turnOrderChanges).subscribe(() => {
        listener(undefined);
      }),
    produceSample: () => {
      entryNumber += 1;
      const previous = { turnorder: JSON.stringify([{ id: `-Nentry${String(entryNumber)}` }]) };
      fake.environment.campaign().set({ turnorder: JSON.stringify([{ id: "-Nnext" }]) });
      turnOrderChanges.deliver({ campaign: fake.environment.campaign(), previous });
    },
  };
});

let fake: FakeModEnvironment;

beforeEach(() => {
  fake = createFakeModEnvironment();
});

describe("the Mod attack roll source", () => {
  function observe(...messages: readonly unknown[]) {
    const { chatMessages } = wireChat(fake);
    const observations: unknown[] = [];
    createModAttackRollSource(fake.environment, chatMessages, testRollOptions()).subscribe((observation) =>
      observations.push(observation),
    );
    for (const message of messages) {
      fake.emit("chat:message", message);
    }
    return observations;
  }

  it("reads a Beyond20 critical as an attack by the roller's token", () => {
    buildPartyOnPage(fake);
    expect(observe(criticalFrom("Niamh", "player-niamh"))).toEqual([
      {
        outcome: "attack",
        attackRoll: { rollerReference: "-Ntokenniamh", keptNaturalD20: 20, criticalThreshold: 20 },
        duplicateKey: expect.any(String) as string,
      },
    ]);
  });

  it("refuses a roll posted for a character the poster does not control (FD19)", () => {
    buildPartyOnPage(fake);
    expect(observe(criticalFrom("Niamh", "player-fighter"))).toEqual([
      { outcome: "unreadable", reason: "poster does not control character" },
    ]);
  });

  it("finds the roller's token on the token layer only, so a GM layer copy is not a second token", () => {
    const { page, niamh } = buildPartyOnPage(fake);
    fake.addToken(page.id, "-Ntokenniamhhidden", { name: "Niamh", represents: niamh.id, layer: "gmlayer" });
    expect(observe(criticalFrom("Niamh", "player-niamh"))).toMatchObject([
      { outcome: "attack", attackRoll: { rollerReference: "-Ntokenniamh" } },
    ]);
  });

  it("refuses a roll when there is no player page", () => {
    fake.addObject("character", { name: "Niamh", controlledby: "player-niamh" });
    expect(observe(criticalFrom("Niamh", "player-niamh"))).toEqual([
      { outcome: "unreadable", reason: "no token on page" },
    ]);
  });

  it("passes on rolls that are not attacks as ignored", () => {
    buildPartyOnPage(fake);
    expect(observe(buildBeyond20Message({ template: "default", playerId: "player-niamh" }))).toEqual([
      { outcome: "ignored" },
    ]);
  });

  it("does not count ordinary chat, its own messages or malformed values as rolls", () => {
    buildPartyOnPage(fake);
    fake.environment.sendChat("Fusion20", "Hello");
    expect(
      observe(
        { type: "general", playerid: "player-niamh", content: "Hello" },
        { ...criticalFrom("Niamh", "player-niamh"), playerid: "API" },
        "not a message",
        null,
      ),
    ).toEqual([]);
  });

  it("gives the same duplicate key to the same post twice, and a different one to different dice", () => {
    buildPartyOnPage(fake);
    const keys = observe(
      criticalFrom("Niamh", "player-niamh", 20),
      criticalFrom("Niamh", "player-niamh", 20),
      criticalFrom("Niamh", "player-niamh", 19),
    ).map((observation) => (observation as { duplicateKey: string }).duplicateKey);
    expect([keys[0] === keys[1], keys[0] === keys[2]]).toEqual([true, false]);
  });

  it("reports a refused natural die from the domain as unreadable", () => {
    buildPartyOnPage(fake);
    const [observation] = observe(criticalFrom("Niamh", "player-niamh", 0));
    expect(observation).toMatchObject({ outcome: "unreadable" });
  });
});

describe("Mod command routing", () => {
  it.each([
    ["!fusion20 end chain=c1", "chain"],
    ["!fusion20 nominate chain=c1", "chain"],
    ["!fusion20", "chain"],
    ["!fusion20 range character=-Nchar value=melee=5", "range"],
    ["!fusion20 roller roll=r1 token=-Ntoken", "roller"],
    ["!other-script do things", undefined],
    ["!fusion200 end chain=c1", undefined],
  ])("routes %j to %s", (commandText, route) => {
    expect(routeCommand(commandText)).toBe(route);
  });

  it("passes on only api commands from players, with the player as actor", () => {
    const { chatMessages } = wireChat(fake);
    const commands: unknown[] = [];
    createModCommandSource(chatMessages, "chain").subscribe((command) => commands.push(command));
    fake.emit("chat:message", { type: "general", playerid: "player-niamh", content: "!fusion20 end chain=c1" });
    fake.emit("chat:message", { type: "api", playerid: "player-niamh", content: 7 });
    fake.environment.sendChat("Fusion20", "!fusion20 end chain=c1");
    fake.emit("chat:message", {
      type: "api",
      playerid: "player-niamh",
      content: "!fusion20 range character=x value=melee=5",
    });
    fake.emit("chat:message", { type: "api", playerid: "player-niamh", content: "!fusion20 end chain=c1" });
    expect(commands).toEqual([{ actorId: "player-niamh", commandText: "!fusion20 end chain=c1" }]);
  });
});

describe("the Mod battlefield source", () => {
  it("says the battlefield is unavailable with no player page", () => {
    expect(createModBattlefieldSource(fake.environment, undefined).readBattlefield()).toEqual({
      outcome: "unavailable",
      reason: "no player page",
    });
  });

  it("passes on the reason a page cannot be used", () => {
    fake.addPlayerPage({ grid_type: "hex" });
    expect(createModBattlefieldSource(fake.environment, undefined).readBattlefield()).toEqual({
      outcome: "unavailable",
      reason: "grid is not square",
    });
  });

  it("reads combatants with their names and who is an ally", () => {
    const { page } = buildPartyOnPage(fake);
    fake.addToken(page.id, "-Ntokenwolf", { name: "Wolf", statusmarkers: "green" });
    fake.addToken(page.id, "-Ntokenother", { name: "Elsewhere", _pageid: "-Nanotherpage" });
    const reading = createModBattlefieldSource(fake.environment, "green").readBattlefield();
    const combatants = reading.outcome === "read" ? reading.snapshot.combatants : [];
    expect(combatants.map(({ reference, displayName, isAlly }) => [reference, displayName, isAlly])).toEqual([
      ["-Ntokenniamh", "Niamh", true],
      ["-Ntokengoblin", "Goblin", false],
      ["-Ntokenfighter", "FighterMan", true],
      ["-Ntokenwolf", "Wolf", true],
    ]);
  });

  it("treats a marked token as hostile when no ally marker is configured", () => {
    const { page } = buildPartyOnPage(fake);
    fake.addToken(page.id, "-Ntokenwolf", { name: "Wolf", statusmarkers: "green" });
    const reading = createModBattlefieldSource(fake.environment, undefined).readBattlefield();
    const wolf = reading.outcome === "read" ? reading.snapshot.combatants.at(-1) : undefined;
    expect(wolf).toMatchObject({ reference: "-Ntokenwolf", isAlly: false });
  });

  it("names a token by its character, or as unnamed, when the token has no name", () => {
    const { page, niamh } = buildPartyOnPage(fake);
    fake.addToken(page.id, "-Ntokenblank", { name: " ", represents: niamh.id });
    fake.addToken(page.id, "-Ntokennothing", { name: "", represents: "-Nmissing" });
    const reading = createModBattlefieldSource(fake.environment, undefined).readBattlefield();
    const names = reading.outcome === "read" ? reading.snapshot.combatants.map(({ displayName }) => displayName) : [];
    expect(names.slice(-2)).toEqual(["Niamh", "An unnamed token"]);
  });
});

describe("the Mod range profile source", () => {
  it("reads the character's fusion20 range attribute", () => {
    buildPartyOnPage(fake);
    expect(createModRangeProfileSource(fake.environment).readRangeProfile("-Ntokenniamh")).toEqual({
      status: "present",
      profile: { meleeReach: 5, rangedLongRange: undefined, cantripRange: undefined },
    });
  });

  it.each([
    ["a token with no character", "-Ntokengoblin"],
    ["a missing token", "-Nnobody"],
  ])("reads %s as missing", (_description, tokenId) => {
    buildPartyOnPage(fake);
    expect(createModRangeProfileSource(fake.environment).readRangeProfile(tokenId)).toEqual({ status: "missing" });
  });

  it("reads a value outside the grammar as malformed", () => {
    const { niamh } = buildPartyOnPage(fake);
    fake.environment.findObjs({ _type: "attribute", _characterid: niamh.id })[0]?.set({ current: "sword" });
    expect(createModRangeProfileSource(fake.environment).readRangeProfile("-Ntokenniamh")).toEqual({
      status: "malformed",
    });
  });
});

describe("the Mod actor authority", () => {
  beforeEach(() => {
    const { page } = buildPartyOnPage(fake);
    fake.addToken(page.id, "-Ntokenshared", { name: "Mule", controlledby: "all" });
    fake.makeGameMaster("player-gm");
  });

  it.each([
    ["the character's controller for its token", "player-niamh", "-Ntokenniamh", true],
    ["another player", "player-fighter", "-Ntokenniamh", false],
    ["anyone, for a token controlled by all", "player-fighter", "-Ntokenshared", true],
    ["a player, for a token nobody controls", "player-niamh", "-Ntokengoblin", false],
    ["a player, for a missing token", "player-niamh", "-Nnobody", false],
  ])("lets %s act: %s", (_description, actorId, tokenId, expected) => {
    expect(createModActorAuthority(fake.environment).mayActFor(actorId, tokenId)).toBe(expected);
  });

  it("knows the GM", () => {
    const authority = createModActorAuthority(fake.environment);
    expect([authority.isGameMaster("player-gm"), authority.isGameMaster("player-niamh")]).toEqual([true, false]);
  });
});

describe("Mod chat output", () => {
  it("writes anything but plain characters as character references", () => {
    expect(escapeChatText("[Free](!fusion20 end chain=c1) /w gm")).toBe(
      "&#91;Free&#93;&#40;&#33;fusion20 end chain&#61;c1&#41; &#47;w gm",
    );
    expect(escapeChatText("Niamh's 2nd go: fine; ok.")).toBe("Niamh's 2nd go: fine; ok.");
  });

  it("whispers a target prompt with a target query button and an end button to the nominator's player", () => {
    buildPartyOnPage(fake);
    createModPrompter(fake.environment).promptForTarget({ chainId: "c1", nominator: "-Ntokenniamh" });
    expect(fake.readWhispers('"Niamh\'s Player"')).toEqual([
      "Niamh's Player, pick a target for your fusion critical.".replace("Niamh's Player", "Niamh") +
        "<br>[Pick a target](!fusion20 target chain=c1 token=&#64;{target|token_id}) " +
        "[End the chain](!fusion20 end chain=c1)",
    ]);
  });

  it("whispers to the GM for a token nobody controls", () => {
    buildPartyOnPage(fake);
    createModPrompter(fake.environment).promptForTarget({ chainId: "c1", nominator: "-Ntokengoblin" });
    expect(fake.readWhispers("gm")).toHaveLength(1);
  });

  it("whispers to the GM instead of a player whose name holds a quotation mark", () => {
    buildPartyOnPage(fake);
    fake.environment.getObj("player", "player-niamh")?.set({ _displayname: 'The "Bard"' });
    createModPrompter(fake.environment).promptForTarget({ chainId: "c1", nominator: "-Ntokenniamh" });
    expect(fake.postedChat.map(({ messageText }) => messageText.split(" ").slice(0, 2).join(" "))).toEqual(["/w gm"]);
  });

  it("whispers each controlling player once", () => {
    const { page } = buildPartyOnPage(fake);
    fake.addToken(page.id, "-Ntokenpair", { name: "Pair", controlledby: "player-niamh,player-fighter,player-niamh" });
    createModPrompter(fake.environment).promptForTarget({ chainId: "c1", nominator: "-Ntokenpair" });
    expect(fake.postedChat.map(({ messageText }) => messageText.split(' "')[1]?.split('"')[0])).toEqual([
      "Niamh's Player",
      "Fighter Player",
    ]);
  });

  it("lists eligible partners as buttons and other allies with their reasons, leaving hostiles out", () => {
    buildPartyOnPage(fake);
    createModPrompter(fake.environment).presentPartners({
      chainId: "c1",
      nominator: "-Ntokenniamh",
      target: "-Ntokengoblin",
      assessments: [
        { reference: "-Ntokenfighter", isEligible: true, reasons: [], distance: 5 },
        { reference: "-Ntokengoblin", isEligible: false, reasons: ["not an ally", "is the target"], distance: 5 },
        { reference: "-Ntokenniamh", isEligible: false, reasons: ["already a participant"], distance: 5 },
      ],
    });
    expect(fake.readWhispers('"Niamh\'s Player"')[0]?.split("<br>")).toEqual([
      "Niamh, pick a partner to attack Goblin.",
      "[FighterMan](!fusion20 nominate chain=c1 partner=-Ntokenfighter)",
      "Niamh: Already in this chain",
      "[End the chain](!fusion20 end chain=c1)",
    ]);
  });

  it("cannot be turned into a button or a command by a character's name", () => {
    const { page } = buildPartyOnPage(fake);
    fake.addToken(page.id, "-Ntokenevil", { name: "[x](!fusion20 end chain=c9)", controlledby: "player-niamh" });
    const prompter = createModPrompter(fake.environment);
    prompter.promptForTarget({ chainId: "c1", nominator: "-Ntokenevil" });
    prompter.presentPartners({
      chainId: "c1",
      nominator: "-Ntokenniamh",
      target: "-Ntokengoblin",
      assessments: [{ reference: "-Ntokenevil", isEligible: true, reasons: [], distance: 5 }],
    });
    prompter.presentPartners({
      chainId: "c1",
      nominator: "-Ntokenniamh",
      target: "-Ntokengoblin",
      assessments: [{ reference: "-Ntokenevil", isEligible: false, reasons: ["out of range"], distance: 50 }],
    });
    const whispers = fake.readWhispers('"Niamh\'s Player"').join(" ");
    expect(whispers).not.toContain("chain=c9");
    expect(whispers).toContain("&#91;x&#93;&#40;&#33;fusion20 end chain&#61;c9&#41;: Cannot reach the target");
    expect(whispers).toContain("[&#91;x&#93;&#40;&#33;fusion20 end chain&#61;c9&#41;](!fusion20 nominate");
  });

  it("escapes an announcement's sentence and keeps its tag readable", () => {
    createModAnnouncer(fake.environment).announce("[x](!y) rolled a fusion critical! [f20:1:started:c1:-Ntoken]");
    expect(fake.readPublic()).toEqual([
      "&#91;x&#93;&#40;&#33;y&#41; rolled a fusion critical&#33; [f20:1:started:c1:-Ntoken]",
    ]);
    expect(fake.postedChat[0]?.speaker).toBe("Fusion20");
  });
});

describe("the Mod turn order source", () => {
  function advanceCount(previousTurnOrder: string, currentTurnOrder: string): number {
    const turnOrderChanges = createListenerFanOut<TurnOrderChange>(() => undefined);
    let advances = 0;
    createModTurnOrderSource(turnOrderChanges).subscribe(() => {
      advances += 1;
    });
    fake.environment.campaign().set({ turnorder: currentTurnOrder });
    turnOrderChanges.deliver({ campaign: fake.environment.campaign(), previous: { turnorder: previousTurnOrder } });
    return advances;
  }

  it("notifies when the turn moves on, and not when an initiative value changes", () => {
    const fighterFirst = JSON.stringify([
      { id: "-Nfighter", pr: "18" },
      { id: "-Ngoblin", pr: "9" },
    ]);
    const goblinFirst = JSON.stringify([
      { id: "-Ngoblin", pr: "9" },
      { id: "-Nfighter", pr: "18" },
    ]);
    const newValue = JSON.stringify([
      { id: "-Nfighter", pr: "20" },
      { id: "-Ngoblin", pr: "9" },
    ]);
    expect([advanceCount(fighterFirst, goblinFirst), advanceCount(fighterFirst, newValue)]).toEqual([1, 0]);
  });
});

describe("the listener fan out", () => {
  it("reports a listener's error and still delivers to the others (FF24)", () => {
    const failures: string[] = [];
    const fanOut = createListenerFanOut<number>((reason) => failures.push(reason));
    const delivered: number[] = [];
    fanOut.subscribe(() => {
      throw new Error("listener broke");
    });
    fanOut.subscribe(() => {
      // Typed as an Error only for the lint rule. It is not one, which is what this checks.
      throw Object.freeze({ notAnError: true }) as unknown as Error;
    });
    fanOut.subscribe((payload) => delivered.push(payload));
    fanOut.deliver(3);
    expect([failures, delivered]).toEqual([["listener broke", "a value that is not an Error was thrown"], [3]]);
  });
});

describe("a roll from a character with several tokens (FD19, FF91)", () => {
  let observations: unknown[];

  beforeEach(() => {
    const { page, niamh } = buildPartyOnPage(fake);
    fake.addToken(page.id, "-Ntokenniamhtwo", { name: "Niamh", represents: niamh.id });
    fake.makeGameMaster("player-gm");
    fake.addPlayer("player-gm", "The GM");
    const { chatMessages } = wireChat(fake);
    observations = [];
    createModAttackRollSource(fake.environment, chatMessages, testRollOptions()).subscribe((observation) =>
      observations.push(observation),
    );
  });

  function pick(playerId: string, rollId: string, tokenId: string): void {
    fake.emit("chat:message", {
      type: "api",
      playerid: playerId,
      content: `!fusion20 roller roll=${rollId} token=${tokenId}`,
    });
  }

  const niamhWhispers = () => fake.readWhispers('"Niamh\'s Player"');

  it("holds the roll and asks its poster to click the token that rolled", () => {
    fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    expect(observations).toEqual([]);
    expect(niamhWhispers()).toEqual([
      "Niamh has more than one token here. Which one made that roll&#63;" +
        "<br>[Pick the token](!fusion20 roller roll=r1 token=&#64;{target|token_id})",
    ]);
  });

  it("observes the attack by the token the poster picks", () => {
    fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    pick("player-niamh", "r1", "-Ntokenniamhtwo");
    expect(observations).toMatchObject([
      { outcome: "attack", attackRoll: { rollerReference: "-Ntokenniamhtwo", keptNaturalD20: 20 } },
    ]);
  });

  it("lets the GM pick for the poster", () => {
    fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    pick("player-gm", "r1", "-Ntokenniamh");
    expect(observations).toHaveLength(1);
  });

  it("refuses another player, and tells them why", () => {
    fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    pick("player-fighter", "r1", "-Ntokenniamh");
    expect(observations).toEqual([]);
    expect(fake.readWhispers('"Fighter Player"')).toEqual([
      "Only the player who made that roll, or the GM, can pick its token.",
    ]);
  });

  it("refuses a token that is not the character's, and keeps the roll for another try", () => {
    fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    pick("player-niamh", "r1", "-Ntokengoblin");
    expect(niamhWhispers().at(-1)).toBe("That token is not one of that character's tokens on this page. Pick again.");
    pick("player-niamh", "r1", "-Ntokenniamh");
    expect(observations).toHaveLength(1);
  });

  it("refuses a second pick, and a roll id it never held", () => {
    fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    pick("player-niamh", "r1", "-Ntokenniamh");
    pick("player-niamh", "r1", "-Ntokenniamhtwo");
    pick("player-niamh", "r9", "-Ntokenniamh");
    expect(observations).toHaveLength(1);
    expect(niamhWhispers().slice(-2)).toEqual([
      "That roll is no longer waiting for a token.",
      "That roll is no longer waiting for a token.",
    ]);
  });

  it("asks once when two tabs relay the same roll (FF28)", () => {
    fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    fake.emit("chat:message", criticalFrom("Niamh", "player-niamh"));
    expect(niamhWhispers()).toHaveLength(1);
  });

  it(`forgets the oldest held roll beyond ${String(maximumHeldRolls)}`, () => {
    for (let rollNumber = 1; rollNumber <= maximumHeldRolls + 1; rollNumber += 1) {
      const distinctDice = [buildDigitalInlineRoll(20, "critical", rollNumber)];
      fake.emit(
        "chat:message",
        buildBeyond20Message({ characterName: "Niamh", playerId: "player-niamh", inlineRolls: distinctDice }),
      );
    }
    expect(niamhWhispers()).toHaveLength(maximumHeldRolls + 1);
    pick("player-niamh", "r1", "-Ntokenniamh");
    pick("player-niamh", "r2", "-Ntokenniamh");
    expect(observations).toHaveLength(1);
    expect(niamhWhispers().at(-1)).toBe("That roll is no longer waiting for a token.");
  });

  it("reports a held roll the domain refuses as unreadable once picked", () => {
    const heldRolls = createHeldRolls(fake.environment, () => "r1");
    heldRolls.hold({
      posterId: "player-niamh",
      characterName: "Niamh",
      candidateTokenIds: ["-Ntokenniamh"],
      keptNaturalD20: 21,
      criticalThreshold: 20,
      duplicateKey: "key",
    });
    expect(heldRolls.choose("player-niamh", "r1", "-Ntokenniamh")).toEqual({
      outcome: "unreadable",
      reason: "natural die out of range",
    });
  });
});
