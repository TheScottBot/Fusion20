import { beforeEach, describe, expect, it } from "vitest";
import { qualifyingPartnerNominates } from "../domain/fusion_chain.ts";
import { encodeChainMessage } from "../protocol/chain_message_table.ts";
import {
  buildAttackRoll,
  buildSightTarget,
  buildSightViewer,
  createInMemoryActorAuthority,
  createInMemoryBattlefieldSource,
  createInMemoryEmitter,
  createInMemoryRangeProfileSource,
  createInMemoryTurnOrderSource,
  createRecordingAnnouncer,
  createRecordingDiagnostics,
  createRecordingPrompter,
  createSettableClock,
} from "../testing/index.ts";
import { createFusionCoordinator, type FusionCoordinator } from "./fusion_coordinator.ts";
import type { AttackObservation, BattlefieldCombatant, ChainCommand } from "./ports.ts";

function combatantAt(reference: string, column: number, isAlly = true): BattlefieldCombatant {
  const centre = { x: column * 70 + 35, y: 35 };
  return {
    reference,
    displayName: reference.replace("token-", "").replace(/^\w/u, (letter) => letter.toUpperCase()),
    isAlly,
    footprint: { firstColumn: column, lastColumn: column, firstRow: 0, lastRow: 0 },
    sightTarget: buildSightTarget({ centre }),
    viewer: buildSightViewer({ position: centre }),
  };
}

const battlefieldSnapshot = {
  grid: { diagonalRule: "foure" as const, scaleNumber: 5, snappingIncrement: 1 },
  scene: { lightingEnabled: false, daylightEnabled: false, daylightOpacity: 1, barriers: [], lights: [] },
  combatants: [
    combatantAt("token-roller", 0),
    combatantAt("token-goblin", 1, false),
    combatantAt("token-ally", 2),
    combatantAt("token-far", 20),
  ],
};

let harness: ReturnType<typeof createHarness>;

function createHarness(mode: "leader" | "follower" = "leader", nominatorRule = qualifyingPartnerNominates) {
  const attackRolls = createInMemoryEmitter<AttackObservation>();
  const chainMessages = createInMemoryEmitter<string>();
  const commands = createInMemoryEmitter<ChainCommand>();
  const turnOrder = createInMemoryTurnOrderSource();
  const battlefield = createInMemoryBattlefieldSource({ outcome: "read", snapshot: battlefieldSnapshot });
  const rangeProfiles = createInMemoryRangeProfileSource();
  const authority = createInMemoryActorAuthority();
  const prompter = createRecordingPrompter();
  const announcer = createRecordingAnnouncer();
  const diagnostics = createRecordingDiagnostics();
  const clock = createSettableClock(1000);
  for (const reference of ["token-roller", "token-goblin", "token-ally", "token-far"]) {
    rangeProfiles.setProfile(reference, {
      status: "present",
      profile: { meleeReach: 5, rangedLongRange: undefined, cantripRange: undefined },
    });
  }
  authority.grant("player-roller", "token-roller");
  authority.grant("player-ally", "token-ally");
  authority.makeGameMaster("player-gm");
  let nextChainNumber = 0;
  const coordinator: FusionCoordinator = createFusionCoordinator(
    {
      attackRolls,
      chainMessages,
      commands,
      turnOrder,
      battlefield,
      rangeProfiles,
      authority,
      prompter,
      announcer,
      diagnostics,
      clock,
    },
    {
      mode,
      createChainId: () => {
        nextChainNumber += 1;
        return `c${String(nextChainNumber)}`;
      },
      chooseNextNominator: nominatorRule,
    },
  );
  coordinator.start();
  return {
    attackRolls,
    chainMessages,
    commands,
    turnOrder,
    battlefield,
    rangeProfiles,
    authority,
    prompter,
    announcer,
    diagnostics,
    clock,
    coordinator,
  };
}

function rollFor(
  reference: string,
  keptNaturalD20: number,
  duplicateKey = `${reference}-${String(keptNaturalD20)}-${String(Math.random())}`,
): AttackObservation {
  return {
    outcome: "attack",
    attackRoll: buildAttackRoll({ rollerReference: reference, keptNaturalD20 }),
    duplicateKey,
  };
}

function command(actorId: string, commandText: string): void {
  harness.commands.emit({ actorId, commandText });
}

function lastAnnouncedTag(): string {
  return harness.announcer.announcements.at(-1)?.split(" ").at(-1) ?? "";
}

function startChainAndTarget(): void {
  harness.attackRolls.emit(rollFor("token-roller", 20));
  command("player-roller", "!fusion20 target chain=c1 token=token-goblin");
}

beforeEach(() => {
  harness = createHarness();
});

// A second ally beside the goblin, so a chain still has someone to nominate after one partner.
function addBardBesideTheGoblin(): void {
  const bard = {
    ...combatantAt("token-bard", 1),
    footprint: { firstColumn: 1, lastColumn: 1, firstRow: 1, lastRow: 1 },
  };
  harness.battlefield.setReading({
    outcome: "read",
    snapshot: { ...battlefieldSnapshot, combatants: [...battlefieldSnapshot.combatants, bard] },
  });
  harness.rangeProfiles.setProfile("token-bard", {
    status: "present",
    profile: { meleeReach: 5, rangedLongRange: undefined, cantripRange: undefined },
  });
}

describe("a fusion chain from start to end", () => {
  it("announces a qualifying critical and asks the roller for a target", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    expect(lastAnnouncedTag()).toBe("[f20:1:started:c1:token-roller]");
    expect(harness.announcer.announcements[0]).toContain("Roller");
    expect(harness.prompter.targetPrompts).toEqual([{ chainId: "c1", nominator: "token-roller" }]);
  });

  it("does nothing for an ordinary roll", () => {
    harness.attackRolls.emit(rollFor("token-roller", 12));
    expect(harness.announcer.announcements).toEqual([]);
    expect(harness.prompter.targetPrompts).toEqual([]);
  });

  it("announces the target and offers assessed partners, eligible ones first", () => {
    startChainAndTarget();
    expect(harness.announcer.announcements.map((message) => message.split(" ").at(-1))).toContain(
      "[f20:1:target:c1:token-goblin]",
    );
    const [partnerPrompt] = harness.prompter.partnerPrompts;
    expect(partnerPrompt).toMatchObject({ chainId: "c1", nominator: "token-roller", target: "token-goblin" });
    expect(partnerPrompt?.assessments.map((assessment) => [assessment.reference, assessment.isEligible])).toEqual([
      ["token-ally", true],
      ["token-goblin", false],
      ["token-roller", false],
      ["token-far", false],
    ]);
  });

  it("announces a nomination", () => {
    startChainAndTarget();
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-ally");
    expect(lastAnnouncedTag()).toBe("[f20:1:nominated:c1:token-roller:token-ally:token-goblin]");
    expect(harness.coordinator.readCounters().nominations).toBe(1);
  });

  it("passes the nomination to a partner whose attack qualifies, without asking for a target again", () => {
    addBardBesideTheGoblin();
    startChainAndTarget();
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-ally");
    harness.attackRolls.emit(rollFor("token-ally", 20));
    expect(lastAnnouncedTag()).toBe("[f20:1:qualified:c1:token-ally:token-ally]");
    expect(harness.prompter.targetPrompts).toHaveLength(1);
    expect(harness.prompter.partnerPrompts.at(-1)).toMatchObject({ nominator: "token-ally", target: "token-goblin" });
  });

  it("hands the right to nominate to the qualifying partner, and takes it from the roller", () => {
    addBardBesideTheGoblin();
    startChainAndTarget();
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-ally");
    harness.attackRolls.emit(rollFor("token-ally", 20));
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-bard");
    expect(harness.coordinator.readCounters().refusedCommands).toEqual({ "not authorised": 1 });
    command("player-ally", "!fusion20 nominate chain=c1 partner=token-bard");
    expect(lastAnnouncedTag()).toBe("[f20:1:nominated:c1:token-ally:token-bard:token-goblin]");
  });

  it("uses the injected nominator rule, as the extension does under FD20", () => {
    harness = createHarness("leader", ({ originalRoller }) => originalRoller);
    addBardBesideTheGoblin();
    startChainAndTarget();
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-ally");
    harness.attackRolls.emit(rollFor("token-ally", 20));
    expect(harness.prompter.partnerPrompts.at(-1)).toMatchObject({ nominator: "token-roller" });
  });

  it("announces the end when the partner's attack does not qualify", () => {
    startChainAndTarget();
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-ally");
    harness.attackRolls.emit(rollFor("token-ally", 4));
    expect(lastAnnouncedTag()).toBe("[f20:1:ended:c1:partner-attack]");
    expect(harness.coordinator.readCounters().chainsEnded).toEqual({ "partner attack": 1 });
  });

  it("ends the chain when nobody is eligible, under FR8", () => {
    harness.rangeProfiles.setProfile("token-ally", { status: "missing" });
    startChainAndTarget();
    expect(lastAnnouncedTag()).toBe("[f20:1:ended:c1:no-eligible-partner]");
    expect(harness.prompter.partnerPrompts).toEqual([]);
  });

  it("ends the chain after a qualifying partner if nobody is left, re-evaluating the battlefield (FR6)", () => {
    startChainAndTarget();
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-ally");
    harness.attackRolls.emit(rollFor("token-ally", 20));
    expect(lastAnnouncedTag()).toBe("[f20:1:ended:c1:no-eligible-partner]");
  });
});

describe("who may act", () => {
  it("refuses and counts a target from a player who is not the nominator", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    command("player-ally", "!fusion20 target chain=c1 token=token-goblin");
    expect(harness.prompter.partnerPrompts).toEqual([]);
    expect(harness.coordinator.readCounters().refusedCommands).toEqual({ "not authorised": 1 });
    expect(harness.diagnostics.lines).toContainEqual({ kind: "refused command", reason: "not authorised" });
  });

  it("refuses a nomination from someone else, and counts it", () => {
    startChainAndTarget();
    command("player-ally", "!fusion20 nominate chain=c1 partner=token-ally");
    expect(harness.coordinator.readCounters().refusedCommands).toEqual({ "not authorised": 1 });
  });

  it("lets the GM act for any nominator", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    command("player-gm", "!fusion20 target chain=c1 token=token-goblin");
    expect(harness.prompter.partnerPrompts).toHaveLength(1);
  });

  it.each([
    ["the nominator", "player-roller", "nominator"],
    ["the GM", "player-gm", "game master"],
  ])("lets %s end the chain, recording the origin", (_description, actorId, origin) => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    command(actorId, "!fusion20 end chain=c1");
    expect(harness.coordinator.readCounters().chainsEnded).toEqual({ [origin]: 1 });
  });

  it("refuses an end from anyone else", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    command("player-ally", "!fusion20 end chain=c1");
    expect(harness.coordinator.readCounters().chainsEnded).toEqual({});
    expect(harness.coordinator.readCounters().refusedCommands).toEqual({ "not authorised": 1 });
  });

  it.each([
    ["an unknown target", "!fusion20 target chain=c1 token=token-nobody", "unknown target"],
    ["the nominator as target", "!fusion20 target chain=c1 token=token-roller", "invalid target"],
    ["an unknown chain", "!fusion20 target chain=c9 token=token-goblin", "unknown chain"],
    ["a malformed command", "!fusion20 target chain=c1", "malformed command"],
    ["a command this layer does not serve", "!fusion20 range character=abc value=melee=5", "unsupported command"],
  ])("refuses %s", (_description, commandText, reason) => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    command("player-roller", commandText);
    expect(harness.coordinator.readCounters().refusedCommands).toEqual({ [reason]: 1 });
  });

  it("refuses a nomination of someone not eligible, judged afresh", () => {
    startChainAndTarget();
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-far");
    expect(harness.coordinator.readCounters().refusedCommands).toEqual({ "partner not eligible": 1 });
  });

  it("refuses a second target once the chain has one", () => {
    startChainAndTarget();
    command("player-roller", "!fusion20 target chain=c1 token=token-ally");
    expect(harness.coordinator.readCounters().refusedCommands).toEqual({ "wrong stage": 1 });
  });

  it("refuses a nomination when the chain is waiting for something else", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-ally");
    expect(harness.coordinator.readCounters().refusedCommands).toEqual({ "wrong stage": 1 });
  });
});

describe("other ways a chain ends", () => {
  it("ends every chain when the turn order advances, under FD9", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    harness.attackRolls.emit(rollFor("token-ally", 20));
    harness.turnOrder.advance();
    expect(harness.coordinator.readCounters().chainsEnded).toEqual({ "turn order": 2 });
  });
});

describe("rolls and duplicates", () => {
  it("counts every observed roll, and unreadable ones by reason", () => {
    harness.attackRolls.emit({ outcome: "unreadable", reason: "no d20" });
    harness.attackRolls.emit({ outcome: "ignored" });
    harness.attackRolls.emit(rollFor("token-ally", 12));
    harness.attackRolls.emit(rollFor("token-roller", 20));
    const counters = harness.coordinator.readCounters();
    expect(counters).toMatchObject({
      rollsObserved: 4,
      rollsUnreadable: { "no d20": 1 },
      qualifyingCriticals: 1,
      chainsStarted: 1,
    });
  });

  it("ignores the same roll arriving twice from two tabs (FF28)", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20, "same-roll"));
    harness.clock.setNow(3500);
    harness.attackRolls.emit(rollFor("token-roller", 20, "same-roll"));
    expect(harness.coordinator.readCounters()).toMatchObject({ chainsStarted: 1, duplicatesIgnored: 1 });
  });

  it("treats the same key later on as a new roll", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20, "same-roll"));
    harness.clock.setNow(10_000);
    harness.attackRolls.emit(rollFor("token-roller", 20, "same-roll"));
    expect(harness.coordinator.readCounters()).toMatchObject({ chainsStarted: 2, duplicatesIgnored: 0 });
  });
});

describe("failures are visible", () => {
  it("reports an unavailable battlefield and leaves the chain waiting", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    harness.battlefield.setReading({ outcome: "unavailable", reason: "page is not readable" });
    command("player-roller", "!fusion20 target chain=c1 token=token-goblin");
    expect(harness.prompter.partnerPrompts).toEqual([]);
    expect(harness.coordinator.readCounters().adapterFailures).toEqual({ battlefield: 1 });
    expect(harness.diagnostics.lines).toContainEqual({
      kind: "adapter failure",
      port: "battlefield",
      reason: "page is not readable",
    });
  });

  it("reports a target that has left the page when partners are offered again", () => {
    addBardBesideTheGoblin();
    startChainAndTarget();
    command("player-roller", "!fusion20 nominate chain=c1 partner=token-ally");
    harness.battlefield.setReading({
      outcome: "read",
      snapshot: { ...battlefieldSnapshot, combatants: [combatantAt("token-roller", 0), combatantAt("token-ally", 2)] },
    });
    harness.attackRolls.emit(rollFor("token-ally", 20));
    expect(harness.coordinator.readCounters().adapterFailures).toEqual({ battlefield: 1 });
    expect(harness.diagnostics.lines).toContainEqual({
      kind: "adapter failure",
      port: "battlefield",
      reason: "target not on page",
    });
  });

  it("states at start that any earlier chain has ended, and the lighting state (FF22)", () => {
    expect(harness.diagnostics.lines[0]).toEqual({ kind: "startup", mode: "leader", lighting: "off" });
  });

  it("counts partner assessments by reason", () => {
    startChainAndTarget();
    expect(harness.coordinator.readCounters().partnerIneligibility).toMatchObject({
      "not an ally": 1,
      "out of range": 1,
    });
  });
});

describe("following chains run elsewhere, under FD11", () => {
  function chainMessage(chainEvent: Parameters<typeof encodeChainMessage>[0]): string {
    return encodeChainMessage(chainEvent, "Elsewhere.");
  }

  it("never prompts in follower mode, and builds its view from chain messages", () => {
    harness = createHarness("follower");
    harness.attackRolls.emit(rollFor("token-roller", 20));
    harness.chainMessages.emit(chainMessage({ kind: "chain started", chainId: "m1", originalRoller: "token-roller" }));
    harness.chainMessages.emit(chainMessage({ kind: "target selected", chainId: "m1", target: "token-goblin" }));
    harness.chainMessages.emit(
      chainMessage({
        kind: "partner nominated",
        chainId: "m1",
        nominator: "token-roller",
        partner: "token-ally",
        target: "token-goblin",
      }),
    );
    expect(harness.prompter.targetPrompts).toEqual([]);
    expect(harness.prompter.partnerPrompts).toEqual([]);
    expect(harness.announcer.announcements).toEqual([]);
    expect(harness.coordinator.readFollowedChains().get("m1")).toEqual({
      chainId: "m1",
      participants: ["token-roller", "token-ally"],
      target: "token-goblin",
    });
  });

  it("forgets a followed chain when it ends", () => {
    harness = createHarness("follower");
    harness.chainMessages.emit(chainMessage({ kind: "chain started", chainId: "m1", originalRoller: "token-roller" }));
    harness.chainMessages.emit(
      chainMessage({ kind: "chain ended", chainId: "m1", origin: "game master", reason: "explicit end" }),
    );
    expect(harness.coordinator.readFollowedChains().size).toBe(0);
  });

  it("follows a chain started elsewhere while leading its own, and ignores the echo of its own messages", () => {
    harness.attackRolls.emit(rollFor("token-roller", 20));
    for (const ownMessage of harness.announcer.announcements) {
      harness.chainMessages.emit(ownMessage);
    }
    harness.chainMessages.emit(chainMessage({ kind: "chain started", chainId: "m7", originalRoller: "token-ally" }));
    expect([...harness.coordinator.readFollowedChains().keys()]).toEqual(["m7"]);
  });

  it("counts a malformed chain message without acting on it", () => {
    harness = createHarness("follower");
    harness.chainMessages.emit("Forged. [f20:9:started:m1:token-roller]");
    harness.chainMessages.emit("Just chatting");
    expect(harness.coordinator.readFollowedChains().size).toBe(0);
    expect(harness.coordinator.readCounters().chainMessagesRefused).toEqual({ "unsupported version": 1 });
  });
});

describe("reading counters", () => {
  it("returns a snapshot that later events do not change", () => {
    const before = harness.coordinator.readCounters();
    harness.attackRolls.emit({ outcome: "unreadable", reason: "no d20" });
    expect(before).toMatchObject({ rollsObserved: 0, rollsUnreadable: {} });
  });
});

describe("stopping", () => {
  it("unsubscribes from every source", () => {
    harness.coordinator.stop();
    expect([
      harness.attackRolls.listenerCount(),
      harness.chainMessages.listenerCount(),
      harness.commands.listenerCount(),
      harness.turnOrder.listenerCount(),
    ]).toEqual([0, 0, 0, 0]);
  });
});
