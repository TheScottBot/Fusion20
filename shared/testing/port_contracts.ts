import { describe, expect, it } from "vitest";
import type { ChainAnnouncer, NominationPrompter, Unsubscribe } from "../application/ports.ts";

// One suite per kind of port. The in memory double and every real adapter run the same suite,
// so a double cannot quietly behave differently from the thing it stands in for.

export interface SourceContractSubject<Payload> {
  readonly subscribe: (listener: (payload: Payload) => void) => Unsubscribe;
  // Makes the real thing produce one payload: a fake Mod event, a fake bridge message.
  readonly produceSample: () => void;
}

export function describeSourceContract<Payload>(
  portName: string,
  createSubject: () => SourceContractSubject<Payload>,
): void {
  describe(`${portName} source contract`, () => {
    it("delivers a produced payload to a subscriber", () => {
      const subject = createSubject();
      const received: Payload[] = [];
      subject.subscribe((payload) => received.push(payload));
      subject.produceSample();
      expect(received).toHaveLength(1);
    });

    it("delivers to every subscriber", () => {
      const subject = createSubject();
      const firstReceived: Payload[] = [];
      const secondReceived: Payload[] = [];
      subject.subscribe((payload) => firstReceived.push(payload));
      subject.subscribe((payload) => secondReceived.push(payload));
      subject.produceSample();
      expect([firstReceived.length, secondReceived.length]).toEqual([1, 1]);
    });

    it("stops delivering after unsubscribe, and leaves other subscribers alone", () => {
      const subject = createSubject();
      const stoppedReceived: Payload[] = [];
      const keptReceived: Payload[] = [];
      const unsubscribe = subject.subscribe((payload) => stoppedReceived.push(payload));
      subject.subscribe((payload) => keptReceived.push(payload));
      unsubscribe();
      subject.produceSample();
      expect([stoppedReceived.length, keptReceived.length]).toEqual([0, 1]);
    });

    it("tolerates unsubscribing twice", () => {
      const subject = createSubject();
      const unsubscribe = subject.subscribe(() => undefined);
      unsubscribe();
      expect(() => {
        unsubscribe();
      }).not.toThrow();
    });
  });
}

export interface AnnouncerContractSubject {
  readonly announcer: ChainAnnouncer;
  // What actually reached the game, as the real adapter's fake environment records it.
  readonly readAnnounced: () => readonly string[];
}

export function describeAnnouncerContract(portName: string, createSubject: () => AnnouncerContractSubject): void {
  describe(`${portName} announcer contract`, () => {
    it("posts each announcement once, unchanged and in order", () => {
      const subject = createSubject();
      subject.announcer.announce("First message. [f20:1:started:c1:roller]");
      subject.announcer.announce("Second message. [f20:1:target:c1:goblin]");
      expect(subject.readAnnounced()).toEqual([
        "First message. [f20:1:started:c1:roller]",
        "Second message. [f20:1:target:c1:goblin]",
      ]);
    });
  });
}

export interface PrompterContractSubject {
  readonly prompter: NominationPrompter;
  readonly readTargetPromptChains: () => readonly string[];
  readonly readPartnerPromptChains: () => readonly string[];
}

export function describePrompterContract(portName: string, createSubject: () => PrompterContractSubject): void {
  describe(`${portName} prompter contract`, () => {
    it("delivers a target prompt for its chain", () => {
      const subject = createSubject();
      subject.prompter.promptForTarget({ chainId: "c1", nominator: "roller" });
      expect(subject.readTargetPromptChains()).toEqual(["c1"]);
    });

    it("delivers a partner prompt for its chain, even with no candidates", () => {
      const subject = createSubject();
      subject.prompter.presentPartners({ chainId: "c2", nominator: "roller", target: "goblin", assessments: [] });
      expect(subject.readPartnerPromptChains()).toEqual(["c2"]);
    });
  });
}
