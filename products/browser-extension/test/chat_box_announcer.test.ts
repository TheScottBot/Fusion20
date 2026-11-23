import { describeAnnouncerContract } from "@fusion20/shared/testing";
import { describe, expect, it } from "vitest";
import { createChatBoxAnnouncer, neutraliseTypedText, type ChatBox } from "../src/chat_box_announcer.ts";

const gameMasterWhisper = "/w gm ";

function createFakeChatBox(initialDraft = "") {
  let draft = initialDraft;
  const sent: string[] = [];
  const chatBox: ChatBox = {
    readDraft: () => draft,
    writeDraft: (text) => {
      draft = text;
    },
    // Roll20 empties the box when it sends.
    pressSend: () => {
      sent.push(draft);
      draft = "";
    },
  };
  return { chatBox, sent, readDraft: () => draft };
}

describeAnnouncerContract("chat box", () => {
  const fake = createFakeChatBox();
  return {
    announcer: createChatBoxAnnouncer(
      () => fake.chatBox,
      () => undefined,
    ),
    readAnnounced: () => fake.sent.filter((sentText) => !sentText.startsWith(gameMasterWhisper)),
    readAnnouncedToGameMaster: () =>
      fake.sent
        .filter((sentText) => sentText.startsWith(gameMasterWhisper))
        .map((sentText) => sentText.slice(gameMasterWhisper.length)),
  };
});

describe("the chat box announcer", () => {
  it("puts back whatever the player was typing", () => {
    const fake = createFakeChatBox("half a sentence");
    createChatBoxAnnouncer(
      () => fake.chatBox,
      () => undefined,
    ).announce("Ends. [f20:1:ended:c1:turn-order]", "table");
    expect([fake.sent, fake.readDraft()]).toEqual([["Ends. [f20:1:ended:c1:turn-order]"], "half a sentence"]);
  });

  it("puts the draft back even when sending fails", () => {
    const fake = createFakeChatBox("my draft");
    const failingBox = {
      ...fake.chatBox,
      pressSend: () => {
        throw new Error("send failed");
      },
    };
    expect(() => {
      createChatBoxAnnouncer(
        () => failingBox,
        () => undefined,
      ).announce("Hi. [f20:1:started:c1:x]", "table");
    }).toThrow("send failed");
    expect(fake.readDraft()).toBe("my draft");
  });

  it("reports a missing chat box instead of posting", () => {
    const failures: string[] = [];
    createChatBoxAnnouncer(
      () => undefined,
      (reason) => failures.push(reason),
    ).announce("Hi. [f20:1:started:c1:x]", "table");
    expect(failures).toEqual(["chat box not found"]);
  });

  it("strips a character's name of anything Roll20 would act on, and keeps the tag", () => {
    const fake = createFakeChatBox();
    createChatBoxAnnouncer(
      () => fake.chatBox,
      () => undefined,
    ).announce(
      "/w gm [x](!fusion20 end chain=c9) @{target|hp} [[1d20]] rolled a fusion critical! [f20:1:started:c1:-Ntoken]",
      "table",
    );
    expect(fake.sent).toEqual([
      "w gm x!fusion20 end chainc9 targethp 1d20 rolled a fusion critical! [f20:1:started:c1:-Ntoken]",
    ]);
  });

  it("posts the tag alone when nothing of the sentence is left", () => {
    const fake = createFakeChatBox();
    createChatBoxAnnouncer(
      () => fake.chatBox,
      () => undefined,
    ).announce("@@@ [f20:1:started:c1:x]", "table");
    expect(fake.sent).toEqual(["[f20:1:started:c1:x]"]);
  });
});

describe("neutraliseTypedText", () => {
  it.each([
    ["Zoë O'Neil-Brown rolled 2 crits: nice; ok?", "Zoë O'Neil-Brown rolled 2 crits: nice; ok?"],
    ["!fusion20 end", "fusion20 end"],
    ["** Bard", "Bard"],
    [
      "<b>Bold</b> &amp; *stars* ~strike~ `code` %{macro} #macro |pipe\\",
      "bBoldb amp; stars strike code macro macro pipe",
    ],
  ])("turns %j into %j", (sentence, expected) => {
    expect(neutraliseTypedText(sentence)).toBe(expected);
  });
});

describe("a quiet announcement (FF109)", () => {
  it("is typed as a whisper to the GM, with the sentence still made safe", () => {
    const fake = createFakeChatBox();
    createChatBoxAnnouncer(
      () => fake.chatBox,
      () => undefined,
    ).announce("[x] rolled a fusion critical! [f20:1:started:c1:-Ntoken]", "game master");
    expect(fake.sent).toEqual(["/w gm x rolled a fusion critical! [f20:1:started:c1:-Ntoken]"]);
  });
});
