import type {
  ActorAuthority,
  AttackObservation,
  AttackRollSource,
  BattlefieldReading,
  BattlefieldSource,
  ChainAnnouncer,
  ChainCommand,
  ChainCommandSource,
  ChainMessageSource,
  Clock,
  DiagnosticLine,
  DiagnosticsSink,
  NominationPrompter,
  PartnerPrompt,
  RangeProfileSource,
  TargetPrompt,
  TurnOrderSource,
  Unsubscribe,
} from "../application/ports.ts";
import type { CombatantReference } from "../domain/attack_roll.ts";
import type { RangeProfileReading } from "../domain/partner_eligibility.ts";

// One generic emitter, since every source port has the same subscribe and unsubscribe contract.
export interface InMemoryEmitter<Payload> {
  readonly subscribe: (listener: (payload: Payload) => void) => Unsubscribe;
  readonly emit: (payload: Payload) => void;
  readonly listenerCount: () => number;
}

export function createInMemoryEmitter<Payload>(): InMemoryEmitter<Payload> {
  const listeners = new Set<(payload: Payload) => void>();
  return {
    subscribe: (listener) => {
      // Wrapped so subscribing the same function twice gives two independent subscriptions.
      const subscription = (payload: Payload): void => {
        listener(payload);
      };
      listeners.add(subscription);
      return () => {
        listeners.delete(subscription);
      };
    },
    emit: (payload) => {
      for (const listener of [...listeners]) {
        listener(payload);
      }
    },
    listenerCount: () => listeners.size,
  };
}

export type InMemoryAttackRollSource = AttackRollSource & InMemoryEmitter<AttackObservation>;
export type InMemoryChainMessageSource = ChainMessageSource & InMemoryEmitter<string>;
export type InMemoryChainCommandSource = ChainCommandSource & InMemoryEmitter<ChainCommand>;

export interface InMemoryTurnOrderSource extends TurnOrderSource {
  readonly advance: () => void;
  readonly listenerCount: () => number;
}

export function createInMemoryTurnOrderSource(): InMemoryTurnOrderSource {
  const emitter = createInMemoryEmitter<undefined>();
  return {
    subscribe: (listener) =>
      emitter.subscribe(() => {
        listener();
      }),
    advance: () => {
      emitter.emit(undefined);
    },
    listenerCount: emitter.listenerCount,
  };
}

export interface InMemoryBattlefieldSource extends BattlefieldSource {
  readonly setReading: (reading: BattlefieldReading) => void;
}

export function createInMemoryBattlefieldSource(initialReading: BattlefieldReading): InMemoryBattlefieldSource {
  let currentReading = initialReading;
  return {
    readBattlefield: () => currentReading,
    setReading: (reading) => {
      currentReading = reading;
    },
  };
}

export interface InMemoryRangeProfileSource extends RangeProfileSource {
  readonly setProfile: (reference: CombatantReference, reading: RangeProfileReading) => void;
}

export function createInMemoryRangeProfileSource(): InMemoryRangeProfileSource {
  const readings = new Map<CombatantReference, RangeProfileReading>();
  return {
    readRangeProfile: (reference) => readings.get(reference) ?? { status: "missing" },
    setProfile: (reference, reading) => {
      readings.set(reference, reading);
    },
  };
}

export interface InMemoryActorAuthority extends ActorAuthority {
  readonly grant: (actorId: string, reference: CombatantReference) => void;
  readonly makeGameMaster: (actorId: string) => void;
}

export function createInMemoryActorAuthority(): InMemoryActorAuthority {
  const grants = new Set<string>();
  const gameMasters = new Set<string>();
  const grantKey = (actorId: string, reference: CombatantReference): string => JSON.stringify([actorId, reference]);
  return {
    mayActFor: (actorId, reference) => grants.has(grantKey(actorId, reference)),
    isGameMaster: (actorId) => gameMasters.has(actorId),
    grant: (actorId, reference) => {
      grants.add(grantKey(actorId, reference));
    },
    makeGameMaster: (actorId) => {
      gameMasters.add(actorId);
    },
  };
}

export interface RecordingPrompter extends NominationPrompter {
  readonly targetPrompts: TargetPrompt[];
  readonly partnerPrompts: PartnerPrompt[];
}

export function createRecordingPrompter(): RecordingPrompter {
  const targetPrompts: TargetPrompt[] = [];
  const partnerPrompts: PartnerPrompt[] = [];
  return {
    targetPrompts,
    partnerPrompts,
    promptForTarget: (prompt) => targetPrompts.push(prompt),
    presentPartners: (prompt) => partnerPrompts.push(prompt),
  };
}

export interface RecordingAnnouncer extends ChainAnnouncer {
  readonly announcements: string[];
}

export function createRecordingAnnouncer(): RecordingAnnouncer {
  const announcements: string[] = [];
  return { announcements, announce: (messageText) => announcements.push(messageText) };
}

export interface RecordingDiagnostics extends DiagnosticsSink {
  readonly lines: DiagnosticLine[];
}

export function createRecordingDiagnostics(): RecordingDiagnostics {
  const lines: DiagnosticLine[] = [];
  return { lines, report: (line) => lines.push(line) };
}

export interface SettableClock extends Clock {
  readonly setNow: (milliseconds: number) => void;
}

export function createSettableClock(startMilliseconds = 0): SettableClock {
  let now = startMilliseconds;
  return {
    nowInMilliseconds: () => now,
    setNow: (milliseconds) => {
      now = milliseconds;
    },
  };
}
