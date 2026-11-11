import {
  chooseTargetCandidates,
  choosePromptPartners,
  ineligiblePartnerText,
  partnerPromptText,
  promptButtonLabel,
  targetPromptText,
  type ChainCommand,
  type ChainCommandSource,
  type NominationPrompter,
  type PartnerPrompt,
  type TargetPrompt,
} from "@fusion20/shared/application";
import { encodeCommand, type ChatCommand } from "@fusion20/shared/protocol";

// The overlay as values, so what it shows is tested without a browser. A renderer turns each
// item into an element, and an action into a button whose command goes to the coordinator.

export type OverlayItem =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "line"; readonly text: string }
  | { readonly kind: "action"; readonly label: string; readonly command: ChatCommand };

export interface OverlayPanel {
  readonly chainId: string;
  readonly prompt: "target" | "partners";
  readonly items: readonly OverlayItem[];
}

export interface NamedCombatant {
  readonly reference: string;
  readonly displayName: string;
}

type OpenPrompt =
  | { readonly prompt: "target"; readonly details: TargetPrompt }
  | {
      readonly prompt: "partners";
      readonly details: PartnerPrompt;
    };

function endAction(chainId: string): OverlayItem {
  return { kind: "action", label: promptButtonLabel.endChain, command: { verb: "end", chain: chainId } };
}

function describeTargetPanel(
  details: TargetPrompt,
  combatants: readonly NamedCombatant[],
  nameOf: (reference: string) => string,
): OverlayPanel {
  return {
    chainId: details.chainId,
    prompt: "target",
    items: [
      { kind: "heading", text: targetPromptText(nameOf(details.nominator)) },
      ...chooseTargetCandidates(combatants, details.nominator).map((combatant): OverlayItem => ({
        kind: "action",
        label: combatant.displayName,
        command: { verb: "target", chain: details.chainId, token: combatant.reference },
      })),
      endAction(details.chainId),
    ],
  };
}

function describePartnerPanel(details: PartnerPrompt, nameOf: (reference: string) => string): OverlayPanel {
  const { eligible, ineligibleAllies } = choosePromptPartners(details.assessments);
  return {
    chainId: details.chainId,
    prompt: "partners",
    items: [
      { kind: "heading", text: partnerPromptText(nameOf(details.nominator), nameOf(details.target)) },
      ...eligible.map((assessment): OverlayItem => ({
        kind: "action",
        label: nameOf(assessment.reference),
        command: { verb: "nominate", chain: details.chainId, partner: assessment.reference },
      })),
      ...ineligibleAllies.map((assessment): OverlayItem => ({
        kind: "line",
        text: ineligiblePartnerText(nameOf(assessment.reference), assessment.reasons),
      })),
      endAction(details.chainId),
    ],
  };
}

// One open prompt per chain: a partner prompt replaces that chain's target prompt in place, so
// panels keep their order while a player is reading them.
export function createOverlayPrompts(onChange: () => void) {
  const openPrompts = new Map<string, OpenPrompt>();
  const open = (chainId: string, openPrompt: OpenPrompt): void => {
    openPrompts.set(chainId, openPrompt);
    onChange();
  };
  const prompter: NominationPrompter = {
    promptForTarget: (details) => {
      open(details.chainId, { prompt: "target", details });
    },
    presentPartners: (details) => {
      open(details.chainId, { prompt: "partners", details });
    },
  };
  return {
    prompter,
    dismiss: (chainId: string) => {
      if (openPrompts.delete(chainId)) {
        onChange();
      }
    },
    describe: (combatants: readonly NamedCombatant[]): readonly OverlayPanel[] => {
      const nameOf = (reference: string): string =>
        combatants.find((combatant) => combatant.reference === reference)?.displayName ?? reference;
      return [...openPrompts.values()].map((openPrompt) =>
        openPrompt.prompt === "target"
          ? describeTargetPanel(openPrompt.details, combatants, nameOf)
          : describePartnerPanel(openPrompt.details, nameOf),
      );
    },
  };
}

// A pressed overlay button becomes the same command text a Mod button would send, from the
// player at this browser.
export function createOverlayCommandSource(readActorId: () => string) {
  const listeners = new Set<{ readonly listener: (command: ChainCommand) => void }>();
  const source: ChainCommandSource = {
    subscribe: (listener) => {
      const subscription = { listener };
      listeners.add(subscription);
      return () => {
        listeners.delete(subscription);
      };
    },
  };
  return {
    source,
    act: (command: ChatCommand) => {
      const chainCommand = { actorId: readActorId(), commandText: encodeCommand(command) };
      for (const subscription of [...listeners]) {
        subscription.listener(chainCommand);
      }
    },
  };
}
