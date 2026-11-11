import { encodeCommand } from "@fusion20/shared/protocol";
import {
  choosePromptPartners,
  ineligiblePartnerText,
  partnerPromptText,
  promptButtonLabel,
  speakerName,
  targetPromptText,
  type ChainAnnouncer,
  type NominationPrompter,
} from "@fusion20/shared/application";
import type { ModEnvironment } from "./mod_environment.ts";
import { nameOfToken, readPlayerName, readTokenControllers } from "./token_records.ts";

// Anyone can name a character, so every name is written as character references before it
// reaches chat. Left alone, a name holding brackets and parentheses would become a working
// button, and one starting with a slash or an exclamation mark would become a command.
const plainCharacter = /^[A-Za-z0-9 ,.':;-]$/u;

export function escapeChatText(text: string): string {
  return Array.from(text, (character) => {
    return plainCharacter.test(character) ? character : `&#${String(character.codePointAt(0))};`;
  }).join("");
}

function renderButton(label: string, commandText: string): string {
  return `[${escapeChatText(label)}](${commandText})`;
}

// Roll20 fills a target query when the button is pressed. Inside a button its at sign must be
// written as a character reference, or the query is resolved when the message is sent.
const targetQuery = "&#64;{target|token_id}";
export const tokenQueryPlaceholder = "FUSION20TOKENQUERY";

// A button that asks the player to click a token, whose id then takes the placeholder's place.
export function renderTokenPickButton(label: string, commandText: string): string {
  return renderButton(label, commandText.replace(tokenQueryPlaceholder, targetQuery));
}

function renderTargetButton(chainId: string): string {
  const commandText = encodeCommand({ verb: "target", chain: chainId, token: tokenQueryPlaceholder });
  return renderTokenPickButton(promptButtonLabel.pickTarget, commandText);
}

function renderEndButton(chainId: string): string {
  return renderButton(promptButtonLabel.endChain, encodeCommand({ verb: "end", chain: chainId }));
}

// Stands for every player: a token controlled by all is prompted in public chat, since anyone
// may act for it (FF110).
export const everyoneTarget = "everyone";

// A display name holding a quotation mark cannot be whispered to safely, so it is skipped.
function quotePlayerName(environment: ModEnvironment, playerId: string): string | undefined {
  const playerName = readPlayerName(environment, playerId);
  return playerName.length > 0 && !playerName.includes('"') ? `"${playerName}"` : undefined;
}

export function whisperTargetForPlayer(environment: ModEnvironment, playerId: string): string {
  return quotePlayerName(environment, playerId) ?? "gm";
}

// Whispers go to the players who control the nominator, or to the GM for a token nobody
// controls.
export function findWhisperTargets(environment: ModEnvironment, tokenId: string): readonly string[] {
  const controllers = readTokenControllers(environment, tokenId);
  if (controllers.includes("all")) {
    return [everyoneTarget];
  }
  const quotedNames = controllers.flatMap((playerId) => {
    return quotePlayerName(environment, playerId) ?? [];
  });
  const uniqueNames = [...new Set(quotedNames)];
  return uniqueNames.length > 0 ? uniqueNames : ["gm"];
}

export function whisperTo(environment: ModEnvironment, whisperTarget: string, messageText: string): void {
  environment.sendChat(
    speakerName,
    whisperTarget === everyoneTarget ? messageText : `/w ${whisperTarget} ${messageText}`,
  );
}

export function createModPrompter(environment: ModEnvironment): NominationPrompter {
  const whisperToNominator = (nominator: string, lines: readonly string[]): void => {
    for (const whisperTarget of findWhisperTargets(environment, nominator)) {
      whisperTo(environment, whisperTarget, lines.join("<br>"));
    }
  };
  const nameOf = (tokenId: string): string => nameOfToken(environment, tokenId);
  return {
    promptForTarget: ({ chainId, nominator }) => {
      whisperToNominator(nominator, [
        escapeChatText(targetPromptText(nameOf(nominator))),
        `${renderTargetButton(chainId)} ${renderEndButton(chainId)}`,
      ]);
    },
    presentPartners: ({ chainId, nominator, target, assessments }) => {
      const { eligible, ineligibleAllies } = choosePromptPartners(assessments);
      const partnerLines = [
        ...eligible.map((assessment) =>
          renderButton(
            nameOf(assessment.reference),
            encodeCommand({ verb: "nominate", chain: chainId, partner: assessment.reference }),
          ),
        ),
        ...ineligibleAllies.map((assessment) =>
          escapeChatText(ineligiblePartnerText(nameOf(assessment.reference), assessment.reasons)),
        ),
      ];
      whisperToNominator(nominator, [
        escapeChatText(partnerPromptText(nameOf(nominator), nameOf(target))),
        ...partnerLines,
        renderEndButton(chainId),
      ]);
    },
  };
}

// The tag is the last word and holds only protocol characters, so it is posted as it is for the
// extension to read (FD12). Everything before it is escaped.
export function createModAnnouncer(environment: ModEnvironment): ChainAnnouncer {
  return {
    announce: (messageText) => {
      const tagStart = messageText.lastIndexOf(" ");
      const sentence = messageText.slice(0, Math.max(tagStart, 0));
      const tag = messageText.slice(tagStart + 1);
      environment.sendChat(speakerName, `${escapeChatText(sentence)} ${tag}`);
    },
  };
}
