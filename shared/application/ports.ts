// Ports carry domain values only. The products translate Roll20 into these with the roll20
// layer, which the application layer may not import (section 2 of the specification).

import type { AttackRoll, CombatantReference } from "../domain/attack_roll.ts";
import type { ChainId } from "../domain/fusion_chain.ts";
import type { SquareGrid, TokenFootprint } from "../domain/grid_geometry.ts";
import type { PartnerAssessment, RangeProfileReading } from "../domain/partner_eligibility.ts";
import type { SightScene, SightTarget, SightViewer } from "../domain/sight_policy.ts";

export type Unsubscribe = () => void;

export type AttackObservation =
  | {
      readonly outcome: "attack";
      readonly attackRoll: AttackRoll;
      // Same player, character and dice, so two tabs posting one roll can be told apart (FF28).
      readonly duplicateKey: string;
    }
  | { readonly outcome: "ignored" }
  | { readonly outcome: "unreadable"; readonly reason: string };

export interface AttackRollSource {
  readonly subscribe: (listener: (observation: AttackObservation) => void) => Unsubscribe;
}

export interface BattlefieldCombatant {
  readonly reference: CombatantReference;
  readonly displayName: string;
  readonly isAlly: boolean;
  readonly footprint: TokenFootprint;
  readonly sightTarget: SightTarget;
  readonly viewer: SightViewer;
}

export interface BattlefieldSnapshot {
  readonly grid: SquareGrid;
  readonly scene: SightScene;
  readonly combatants: readonly BattlefieldCombatant[];
}

export type BattlefieldReading =
  | { readonly outcome: "read"; readonly snapshot: BattlefieldSnapshot }
  | { readonly outcome: "unavailable"; readonly reason: string };

export interface BattlefieldSource {
  readonly readBattlefield: () => BattlefieldReading;
}

export interface RangeProfileSource {
  readonly readRangeProfile: (reference: CombatantReference) => RangeProfileReading;
}

export interface ActorAuthority {
  readonly mayActFor: (actorId: string, reference: CombatantReference) => boolean;
  readonly isGameMaster: (actorId: string) => boolean;
}

export interface TargetPrompt {
  readonly chainId: ChainId;
  readonly nominator: CombatantReference;
}

export interface PartnerPrompt {
  readonly chainId: ChainId;
  readonly nominator: CombatantReference;
  readonly target: CombatantReference;
  readonly assessments: readonly PartnerAssessment[];
}

export interface NominationPrompter {
  readonly promptForTarget: (prompt: TargetPrompt) => void;
  readonly presentPartners: (prompt: PartnerPrompt) => void;
}

export interface ChainAnnouncer {
  readonly announce: (messageText: string) => void;
}

export interface ChainMessageSource {
  readonly subscribe: (listener: (messageText: string) => void) => Unsubscribe;
}

export interface ChainCommand {
  readonly actorId: string;
  readonly commandText: string;
}

export interface ChainCommandSource {
  readonly subscribe: (listener: (command: ChainCommand) => void) => Unsubscribe;
}

export interface TurnOrderSource {
  readonly subscribe: (listener: () => void) => Unsubscribe;
}

export interface Clock {
  readonly nowInMilliseconds: () => number;
}

export type DiagnosticLine =
  | { readonly kind: "startup"; readonly mode: CoordinatorMode; readonly lighting: "on" | "off" | "unavailable" }
  | { readonly kind: "refused command"; readonly reason: string }
  | { readonly kind: "adapter failure"; readonly port: string; readonly reason: string };

export type CoordinatorMode = "leader" | "follower";

export interface DiagnosticsSink {
  readonly report: (line: DiagnosticLine) => void;
}

// Everything the coordinator needs from a product, in one value the product assembles.
export interface FusionCoordinatorPorts {
  readonly attackRolls: AttackRollSource;
  readonly chainMessages: ChainMessageSource;
  readonly commands: ChainCommandSource;
  readonly turnOrder: TurnOrderSource;
  readonly battlefield: BattlefieldSource;
  readonly rangeProfiles: RangeProfileSource;
  readonly authority: ActorAuthority;
  readonly prompter: NominationPrompter;
  readonly announcer: ChainAnnouncer;
  readonly diagnostics: DiagnosticsSink;
  readonly clock: Clock;
}
