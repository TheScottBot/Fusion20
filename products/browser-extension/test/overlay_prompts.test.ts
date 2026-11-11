import { describePrompterContract, describeSourceContract } from "@fusion20/shared/testing";
import { describe, expect, it } from "vitest";
import { createOverlayCommandSource, createOverlayPrompts } from "../src/overlay_prompts.ts";

const combatants = [
  { reference: "-Nroller", displayName: "Niamh" },
  { reference: "-Ngoblin", displayName: "Goblin" },
  { reference: "-Nfighter", displayName: "FighterMan" },
];

describePrompterContract("overlay", () => {
  const overlay = createOverlayPrompts(() => undefined);
  const chainsOf = (prompt: "target" | "partners") =>
    overlay
      .describe(combatants)
      .filter((panel) => panel.prompt === prompt)
      .map(({ chainId }) => chainId);
  return {
    prompter: overlay.prompter,
    readTargetPromptChains: () => chainsOf("target"),
    readPartnerPromptChains: () => chainsOf("partners"),
  };
});

describeSourceContract("overlay command", () => {
  const overlayCommands = createOverlayCommandSource(() => "player-niamh");
  return {
    subscribe: overlayCommands.source.subscribe,
    produceSample: () => {
      overlayCommands.act({ verb: "end", chain: "c1" });
    },
  };
});

describe("the overlay prompts", () => {
  it("offers every other token as a target, and an end button", () => {
    const overlay = createOverlayPrompts(() => undefined);
    overlay.prompter.promptForTarget({ chainId: "c1", nominator: "-Nroller" });
    const [panel] = overlay.describe(combatants);
    expect([panel?.chainId, panel?.prompt]).toEqual(["c1", "target"]);
    expect(
      panel?.items.map((overlayItem) => (overlayItem.kind === "action" ? overlayItem.command : overlayItem.text)),
    ).toEqual([
      "Niamh, pick a target for your fusion critical.",
      { verb: "target", chain: "c1", token: "-Ngoblin" },
      { verb: "target", chain: "c1", token: "-Nfighter" },
      { verb: "end", chain: "c1" },
    ]);
    expect(panel?.items.flatMap((overlayItem) => (overlayItem.kind === "action" ? [overlayItem.label] : []))).toEqual([
      "Goblin",
      "FighterMan",
      "End the chain",
    ]);
  });

  it("replaces a chain's target prompt with its partner prompt, listing reasons in words", () => {
    const overlay = createOverlayPrompts(() => undefined);
    overlay.prompter.promptForTarget({ chainId: "c1", nominator: "-Nroller" });
    overlay.prompter.presentPartners({
      chainId: "c1",
      nominator: "-Nroller",
      target: "-Ngoblin",
      assessments: [
        { reference: "-Nfighter", isEligible: true, reasons: [], distance: 5 },
        { reference: "-Ngoblin", isEligible: false, reasons: ["not an ally", "is the target"], distance: 0 },
        { reference: "-Nroller", isEligible: false, reasons: ["already a participant"], distance: 5 },
      ],
    });
    expect(overlay.describe(combatants)).toEqual([
      {
        chainId: "c1",
        prompt: "partners",
        items: [
          { kind: "heading", text: "Niamh, pick a partner to attack Goblin." },
          { kind: "action", label: "FighterMan", command: { verb: "nominate", chain: "c1", partner: "-Nfighter" } },
          { kind: "line", text: "Niamh: Already in this chain" },
          { kind: "action", label: "End the chain", command: { verb: "end", chain: "c1" } },
        ],
      },
    ]);
  });

  it("keeps a chain's panel in place when its prompt changes", () => {
    const overlay = createOverlayPrompts(() => undefined);
    overlay.prompter.promptForTarget({ chainId: "c1", nominator: "-Nroller" });
    overlay.prompter.promptForTarget({ chainId: "c2", nominator: "-Nfighter" });
    overlay.prompter.presentPartners({ chainId: "c1", nominator: "-Nroller", target: "-Ngoblin", assessments: [] });
    expect(overlay.describe(combatants).map(({ chainId, prompt }) => [chainId, prompt])).toEqual([
      ["c1", "partners"],
      ["c2", "target"],
    ]);
  });

  it("keeps separate chains apart, newest last, and names an unknown token by its id", () => {
    const overlay = createOverlayPrompts(() => undefined);
    overlay.prompter.promptForTarget({ chainId: "c1", nominator: "-Nroller" });
    overlay.prompter.promptForTarget({ chainId: "c2", nominator: "-Nstranger" });
    const panels = overlay.describe(combatants);
    expect(panels.map(({ chainId }) => chainId)).toEqual(["c1", "c2"]);
    expect(panels[1]?.items[0]).toEqual({
      kind: "heading",
      text: "-Nstranger, pick a target for your fusion critical.",
    });
  });

  it("tells the renderer when to redraw, and only when something changed", () => {
    let changes = 0;
    const overlay = createOverlayPrompts(() => {
      changes += 1;
    });
    overlay.prompter.promptForTarget({ chainId: "c1", nominator: "-Nroller" });
    overlay.dismiss("c1");
    overlay.dismiss("c1");
    expect([changes, overlay.describe(combatants)]).toEqual([2, []]);
  });
});

describe("the overlay command source", () => {
  it("sends the command text a Mod button would, from this browser's player", () => {
    const overlayCommands = createOverlayCommandSource(() => "player-niamh");
    const received: unknown[] = [];
    overlayCommands.source.subscribe((command) => received.push(command));
    overlayCommands.act({ verb: "nominate", chain: "c1", partner: "-Nfighter" });
    expect(received).toEqual([
      { actorId: "player-niamh", commandText: "!fusion20 nominate chain=c1 partner=-Nfighter" },
    ]);
  });
});
