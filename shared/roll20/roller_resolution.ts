export interface CharacterRecord {
  readonly id: string;
  readonly name: string;
  readonly controlledBy: readonly string[];
}

export interface RollerTokenRecord {
  readonly id: string;
  readonly represents: string;
}

export interface RollPoster {
  readonly characterName: string;
  readonly playerId: string;
  readonly posterIsGameMaster: boolean;
}

export type RollerResolution =
  | { readonly outcome: "resolved"; readonly tokenId: string }
  | { readonly outcome: "choose"; readonly tokenIds: readonly string[] }
  | {
      readonly outcome: "refused";
      readonly reason:
        "unknown character" | "ambiguous character name" | "poster does not control character" | "no token on page";
    };

// Roll20's own word for every player, which also appears in a controlledby list.
const everyPlayer = "all";

// Matched ignoring case and outer spaces, the way Beyond20 picks a speaker.
function normaliseName(characterName: string): string {
  return characterName.trim().toLowerCase();
}

// FD19: a chat post carries only a character name, which anyone can type, so the poster must
// control that character, or be the GM, before the name is trusted to mean a token.
export function resolveRoller(
  poster: RollPoster,
  characters: readonly CharacterRecord[],
  tokensOnPage: readonly RollerTokenRecord[],
): RollerResolution {
  const wantedName = normaliseName(poster.characterName);
  const matchingCharacters = characters.filter((character) => normaliseName(character.name) === wantedName);
  if (matchingCharacters.length === 0) {
    return { outcome: "refused", reason: "unknown character" };
  }
  // Only characters the poster controls count, so a player cannot block another character's
  // rolls by naming a sheet of their own the same (FF108).
  const controlledCharacters = matchingCharacters.filter((character) => {
    return (
      poster.posterIsGameMaster ||
      character.controlledBy.includes(poster.playerId) ||
      character.controlledBy.includes(everyPlayer)
    );
  });
  const [character, ...otherMatches] = controlledCharacters;
  if (character === undefined) {
    return { outcome: "refused", reason: "poster does not control character" };
  }
  if (otherMatches.length > 0) {
    return { outcome: "refused", reason: "ambiguous character name" };
  }
  const tokenIds = tokensOnPage
    .filter((pageToken) => pageToken.represents === character.id)
    .map((pageToken) => pageToken.id);
  const [onlyTokenId, ...otherTokenIds] = tokenIds;
  if (onlyTokenId === undefined) {
    return { outcome: "refused", reason: "no token on page" };
  }
  return otherTokenIds.length === 0 ? { outcome: "resolved", tokenId: onlyTokenId } : { outcome: "choose", tokenIds };
}
