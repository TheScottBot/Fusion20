export interface ProseViolation {
  readonly lineNumber: number;
  readonly category: "en dash" | "em dash" | "hyphen run";
}

// Built from code points, since this file is inside the tree it scans.
const enDash = String.fromCodePoint(0x2013);
const emDash = String.fromCodePoint(0x2014);
const hyphenRunPattern = /-{2,}/gu;
const markdownTableSeparatorPattern = /^\s*\|[\s:|-]+\|\s*$/u;
// A flag token is the one legitimate double hyphen, so it must start a word and be followed
// by a lower case letter. Anything looser would let a mangled dash through as a flag.
const flagTokenPrefixes = new Set([undefined, " ", "\t", '"', "'", "`", "(", "["]);
const lowerCaseLetterPattern = /[a-z]/u;

function isFlagToken(lineText: string, hyphenRunStart: number, hyphenRunLength: number): boolean {
  if (hyphenRunLength !== 2) {
    return false;
  }
  const precedingCharacter = hyphenRunStart === 0 ? undefined : lineText[hyphenRunStart - 1];
  const followingCharacter = lineText[hyphenRunStart + hyphenRunLength] ?? "";
  return flagTokenPrefixes.has(precedingCharacter) && lowerCaseLetterPattern.test(followingCharacter);
}

function lineContainsMangledHyphenRun(lineText: string): boolean {
  if (markdownTableSeparatorPattern.test(lineText)) {
    return false;
  }
  for (const hyphenRun of lineText.matchAll(hyphenRunPattern)) {
    if (!isFlagToken(lineText, hyphenRun.index, hyphenRun[0].length)) {
      return true;
    }
  }
  return false;
}

export function findProseViolations(fileText: string): ProseViolation[] {
  const violations: ProseViolation[] = [];
  fileText.split("\n").forEach((lineText, lineIndex) => {
    const lineNumber = lineIndex + 1;
    if (lineText.includes(enDash)) {
      violations.push({ lineNumber, category: "en dash" });
    }
    if (lineText.includes(emDash)) {
      violations.push({ lineNumber, category: "em dash" });
    }
    if (lineContainsMangledHyphenRun(lineText)) {
      violations.push({ lineNumber, category: "hyphen run" });
    }
  });
  return violations;
}
