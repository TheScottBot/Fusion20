import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chainEndOrigins } from "../domain/fusion_chain.ts";
import { chainMessageWireNames, encodeChainEndOrigin } from "./chain_message_table.ts";
import { commandVerbs } from "./command_table.ts";

// PROTOCOL.md describes the tables for other readers. This keeps it from falling behind them.
const protocolDocument = readFileSync(join(import.meta.dirname, "PROTOCOL.md"), "utf8");

// A first table cell holding exactly this code, however the formatter pads it.
function hasTableRowFor(code: string): boolean {
  return protocolDocument.split("\n").some((line) => line.split("|")[1]?.trim() === `\`${code}\``);
}

describe("the protocol document", () => {
  it.each(commandVerbs)("describes the %s command", (verb) => {
    expect(hasTableRowFor(verb)).toBe(true);
  });

  it.each(chainMessageWireNames)("describes the %s message", (wireName) => {
    expect(hasTableRowFor(wireName)).toBe(true);
  });

  it.each(chainEndOrigins)("describes the %s end origin as it appears on the wire", (origin) => {
    expect(hasTableRowFor(encodeChainEndOrigin(origin))).toBe(true);
  });
});
