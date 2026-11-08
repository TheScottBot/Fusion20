export interface AllyCandidate {
  readonly controlledBy: readonly string[];
  readonly represents: string;
  readonly statusMarkers: readonly string[];
}

export function readPlayerList(rawValue: unknown): readonly string[] {
  if (typeof rawValue !== "string") {
    return [];
  }
  return rawValue
    .split(",")
    .map((playerId) => playerId.trim())
    .filter((playerId) => playerId.length > 0);
}

// FD3: an ally is anything a player controls, through the token or its character, or anything
// carrying the status marker the GM chose for allied NPCs. A linked token's own controlledby
// can be empty while its character's is set, so both are read (FF45).
export function isAlly(
  candidate: AllyCandidate,
  lookUpCharacterPlayers: (characterId: string) => readonly string[] | undefined,
  allyMarker: string | undefined,
): boolean {
  if (candidate.controlledBy.length > 0) {
    return true;
  }
  const characterPlayers = candidate.represents.length > 0 ? lookUpCharacterPlayers(candidate.represents) : undefined;
  if (characterPlayers !== undefined && characterPlayers.length > 0) {
    return true;
  }
  return allyMarker !== undefined && candidate.statusMarkers.includes(allyMarker);
}
