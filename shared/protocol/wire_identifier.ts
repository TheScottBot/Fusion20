// Roll20 ids are twenty characters of letters, digits, hyphens and underscores, as seen in real
// captures. The bound leaves room without letting a message grow freely.
export const maximumIdentifierLength = 32;

const identifierPattern = new RegExp(`^[A-Za-z0-9_-]{1,${String(maximumIdentifierLength)}}$`, "u");

export function isWireIdentifier(candidate: string): boolean {
  return identifierPattern.test(candidate);
}
