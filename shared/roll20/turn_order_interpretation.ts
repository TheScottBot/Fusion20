import { isRecord, readText } from "./untrusted_value.ts";

// A large combat holds a few dozen entries of under a hundred characters each. The bound keeps
// a hostile campaign value from costing a parse of any size (datum 0.10).
export const maximumTurnOrderLength = 200_000;

// Roll20 writes the whole turn order whenever anything in it changes, including a GM editing an
// initiative value. Only a new entry at the top means the turn moved on (FD9).
function readTopEntry(turnOrderValue: unknown): string | undefined {
  const turnOrderText = readText(turnOrderValue);
  if (turnOrderText === undefined || turnOrderText.length > maximumTurnOrderLength) {
    return undefined;
  }
  let turnOrder: unknown;
  try {
    turnOrder = JSON.parse(turnOrderText);
  } catch {
    return undefined;
  }
  const topEntry: unknown = Array.isArray(turnOrder) ? turnOrder[0] : undefined;
  if (!isRecord(topEntry)) {
    return undefined;
  }
  // A custom entry has id -1, so its text tells two custom entries apart.
  return JSON.stringify([readText(topEntry.id) ?? "", readText(topEntry.custom) ?? ""]);
}

export function hasTurnOrderAdvanced(previousTurnOrder: unknown, currentTurnOrder: unknown): boolean {
  return readTopEntry(previousTurnOrder) !== readTopEntry(currentTurnOrder);
}
