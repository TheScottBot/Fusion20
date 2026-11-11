import {
  promptButtonLabel,
  rollerPromptText,
  rollerRefusalText,
  type AttackObservation,
} from "@fusion20/shared/application";
import { createAttackRoll } from "@fusion20/shared/domain";
import { encodeCommand } from "@fusion20/shared/protocol";
import {
  escapeChatText,
  renderTokenPickButton,
  tokenQueryPlaceholder,
  whisperTargetForPlayer,
  whisperTo,
} from "./chat_output.ts";
import type { ModEnvironment } from "./mod_environment.ts";

// FD19: when the character who rolled has several tokens on the page, the roll waits here
// until its poster clicks the one that rolled (FF91).

export interface HeldRoll {
  readonly posterId: string;
  readonly characterName: string;
  readonly candidateTokenIds: readonly string[];
  readonly keptNaturalD20: number;
  readonly criticalThreshold: number;
  readonly duplicateKey: string;
}

export type RollerChoice =
  | { readonly outcome: "chosen"; readonly observation: AttackObservation }
  | { readonly outcome: "refused"; readonly reason: keyof typeof rollerRefusalText };

// A held roll nobody answers would otherwise stay for the life of the sandbox. Twenty is far
// more than a table leaves waiting at once.
export const maximumHeldRolls = 20;

export function createHeldRolls(environment: ModEnvironment, createRollId: () => string) {
  const heldRolls = new Map<string, HeldRoll>();

  const hold = (heldRoll: HeldRoll): void => {
    // Two tabs relaying one roll must not ask twice (FF28).
    if ([...heldRolls.values()].some(({ duplicateKey }) => duplicateKey === heldRoll.duplicateKey)) {
      return;
    }
    const rollId = createRollId();
    heldRolls.set(rollId, heldRoll);
    for (const staleId of [...heldRolls.keys()].slice(0, Math.max(heldRolls.size - maximumHeldRolls, 0))) {
      heldRolls.delete(staleId);
    }
    const commandText = encodeCommand({ verb: "roller", roll: rollId, token: tokenQueryPlaceholder });
    whisperTo(
      environment,
      whisperTargetForPlayer(environment, heldRoll.posterId),
      `${escapeChatText(rollerPromptText(heldRoll.characterName))}<br>${renderTokenPickButton(promptButtonLabel.pickRoller, commandText)}`,
    );
  };

  const decide = (actorId: string, rollId: string, tokenId: string): RollerChoice => {
    const heldRoll = heldRolls.get(rollId);
    if (heldRoll === undefined) {
      return { outcome: "refused", reason: "unknown roll" };
    }
    if (actorId !== heldRoll.posterId && !environment.playerIsGM(actorId)) {
      return { outcome: "refused", reason: "not your roll" };
    }
    if (!heldRoll.candidateTokenIds.includes(tokenId)) {
      return { outcome: "refused", reason: "not a candidate" };
    }
    heldRolls.delete(rollId);
    const creation = createAttackRoll({
      rollerReference: tokenId,
      keptNaturalD20: heldRoll.keptNaturalD20,
      criticalThreshold: heldRoll.criticalThreshold,
    });
    const observation: AttackObservation =
      creation.outcome === "created"
        ? { outcome: "attack", attackRoll: creation.attackRoll, duplicateKey: heldRoll.duplicateKey }
        : { outcome: "unreadable", reason: creation.reason };
    return { outcome: "chosen", observation };
  };

  // Refusals are told to the player who clicked, so a wrong click can be put right.
  const choose = (actorId: string, rollId: string, tokenId: string): AttackObservation | undefined => {
    const choice = decide(actorId, rollId, tokenId);
    if (choice.outcome === "chosen") {
      return choice.observation;
    }
    whisperTo(
      environment,
      whisperTargetForPlayer(environment, actorId),
      escapeChatText(rollerRefusalText[choice.reason]),
    );
    return undefined;
  };

  return { hold, choose, countHeld: () => heldRolls.size };
}
