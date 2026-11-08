import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { buildBeyond20Message, buildDigitalInlineRoll } from "@fusion20/shared/testing";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { describeProductBundle } from "../../../tools/build/product_bundle.ts";
import { buildPartyOnPage, createFakeModEnvironment } from "./fake_mod_environment.ts";

const productDirectory = join(import.meta.dirname, "..");

async function buildBundleText(): Promise<string> {
  const buildResult = await build({ ...describeProductBundle(productDirectory, "fusion20"), write: false });
  const [outputFile] = buildResult.outputFiles;
  if (outputFile === undefined) {
    throw new Error("esbuild produced no bundle");
  }
  return outputFile.text;
}

describe("the Mod bundle", () => {
  it("runs a chain in a sandbox that provides only the Mod globals", async () => {
    const fake = createFakeModEnvironment();
    buildPartyOnPage(fake);
    const { environment } = fake;
    // A fresh context holds the language's own globals and nothing from Node, like the sandbox.
    const sandbox = createContext({
      on: environment.on,
      findObjs: environment.findObjs,
      getObj: environment.getObj,
      createObj: environment.createObj,
      sendChat: environment.sendChat,
      log: environment.log,
      playerIsGM: environment.playerIsGM,
      Campaign: environment.campaign,
    });
    runInContext(await buildBundleText(), sandbox);
    fake.emit("ready");
    fake.emit(
      "chat:message",
      buildBeyond20Message({
        characterName: "Niamh",
        playerId: "player-niamh",
        inlineRolls: [buildDigitalInlineRoll(20, "critical")],
      }),
    );
    expect(fake.loggedLines).toHaveLength(2);
    expect(fake.readPublic()).toEqual([
      expect.stringMatching(/^Niamh rolled a fusion critical&#33; \[f20:1:started:/u),
    ]);
    expect(fake.readWhispers('"Niamh\'s Player"')).toHaveLength(1);
  });

  it("starts with its wrapper, so no directive reaches the scripts it is joined to (FF93)", async () => {
    expect((await buildBundleText()).startsWith("(() => {")).toBe(true);
  });

  it("leaves no name of its own in the shared global scope", async () => {
    const sandbox = createContext({ on: () => undefined, Campaign: () => undefined });
    const namesBefore = Object.keys(sandbox);
    runInContext(await buildBundleText(), sandbox);
    expect(Object.keys(sandbox)).toEqual(namesBefore);
  });
});
