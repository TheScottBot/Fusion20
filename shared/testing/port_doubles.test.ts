import { describe, expect, it } from "vitest";
import * as doubles from "./port_doubles.ts";
import { describeAnnouncerContract, describePrompterContract, describeSourceContract } from "./port_contracts.ts";

describeSourceContract("in memory attack roll", () => {
  const emitter = doubles.createInMemoryEmitter<{ readonly outcome: "ignored" }>();
  return {
    subscribe: emitter.subscribe,
    produceSample: () => {
      emitter.emit({ outcome: "ignored" });
    },
  };
});

describeSourceContract("in memory chain message", () => {
  const emitter = doubles.createInMemoryEmitter<string>();
  return {
    subscribe: emitter.subscribe,
    produceSample: () => {
      emitter.emit("A sentence. [f20:1:started:c1:roller]");
    },
  };
});

describeSourceContract("in memory chain command", () => {
  const emitter = doubles.createInMemoryEmitter<{ actorId: string; commandText: string }>();
  return {
    subscribe: emitter.subscribe,
    produceSample: () => {
      emitter.emit({ actorId: "player", commandText: "!fusion20 end chain=c1" });
    },
  };
});

describeSourceContract("in memory turn order", () => {
  const turnOrder = doubles.createInMemoryTurnOrderSource();
  return {
    subscribe: (listener) =>
      turnOrder.subscribe(() => {
        listener(undefined);
      }),
    produceSample: turnOrder.advance,
  };
});

describeAnnouncerContract("recording", () => {
  const announcer = doubles.createRecordingAnnouncer();
  return { announcer, readAnnounced: () => announcer.announcements };
});

describePrompterContract("recording", () => {
  const prompter = doubles.createRecordingPrompter();
  return {
    prompter,
    readTargetPromptChains: () => prompter.targetPrompts.map((prompt) => prompt.chainId),
    readPartnerPromptChains: () => prompter.partnerPrompts.map((prompt) => prompt.chainId),
  };
});

describe("the remaining doubles", () => {
  it("report a range profile as missing until one is set", () => {
    const rangeProfiles = doubles.createInMemoryRangeProfileSource();
    expect(rangeProfiles.readRangeProfile("someone")).toEqual({ status: "missing" });
    rangeProfiles.setProfile("someone", { status: "malformed" });
    expect(rangeProfiles.readRangeProfile("someone")).toEqual({ status: "malformed" });
  });

  it("grant authority per actor and combatant, and separately make a GM", () => {
    const authority = doubles.createInMemoryActorAuthority();
    authority.grant("player", "hero");
    authority.makeGameMaster("gm");
    expect([
      authority.mayActFor("player", "hero"),
      authority.mayActFor("player", "other"),
      authority.isGameMaster("gm"),
    ]).toEqual([true, false, true]);
  });

  it("hold a battlefield reading until it is replaced, and a clock until it is set", () => {
    const battlefield = doubles.createInMemoryBattlefieldSource({ outcome: "unavailable", reason: "first" });
    battlefield.setReading({ outcome: "unavailable", reason: "second" });
    expect(battlefield.readBattlefield()).toEqual({ outcome: "unavailable", reason: "second" });
    const clock = doubles.createSettableClock(5);
    clock.setNow(9);
    expect(clock.nowInMilliseconds()).toBe(9);
  });
});
