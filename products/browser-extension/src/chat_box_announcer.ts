import type { ChainAnnouncer } from "@fusion20/shared/application";

// The chat box as the announcer needs it. The page wiring finds Roll20's own, following
// Beyond20's precedent: write the text, press send, put the player's draft back.
export interface ChatBox {
  readonly readDraft: () => string;
  readonly writeDraft: (text: string) => void;
  readonly pressSend: () => void;
}

// Typed text is read by Roll20 as the player's own: brackets make buttons, a slash or an
// exclamation mark at the start makes a command, and at signs, percent signs and double
// brackets pull in sheet values and rolls. Whether character references survive typing is not
// known, so the sentence keeps only letters, digits and plain punctuation (FF102).
const disallowedCharacters = /[^\p{L}\p{M}\p{N} .,'!?:;-]/gu;
const leadingNonWord = /^[^\p{L}\p{N}]+/u;

export function neutraliseTypedText(sentence: string): string {
  return sentence.replace(disallowedCharacters, "").replace(leadingNonWord, "");
}

export function createChatBoxAnnouncer(
  findChatBox: () => ChatBox | undefined,
  reportFailure: (reason: string) => void,
): ChainAnnouncer {
  return {
    announce: (messageText) => {
      const chatBox = findChatBox();
      if (chatBox === undefined) {
        reportFailure("chat box not found");
        return;
      }
      // The tag is the last word and holds only protocol characters (FD12).
      const tagStart = messageText.lastIndexOf(" ");
      const sentence = neutraliseTypedText(messageText.slice(0, Math.max(tagStart, 0)));
      const tag = messageText.slice(tagStart + 1);
      const draft = chatBox.readDraft();
      chatBox.writeDraft(sentence.length > 0 ? `${sentence} ${tag}` : tag);
      chatBox.pressSend();
      chatBox.writeDraft(draft);
    },
  };
}
