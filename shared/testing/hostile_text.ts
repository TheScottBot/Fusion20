import fc from "fast-check";

const fuzzRunCount = 20_000;

// Plain, binary and near grammar text together, since purely random text rarely gets past a
// parser's first check, and near grammar text is what reaches its deeper branches.
export function assertHoldsForHostileText(
  grammarFragments: readonly string[],
  assertProperty: (hostileText: string) => void,
): void {
  const nearGrammar = fc
    .array(fc.constantFrom(...grammarFragments), { maxLength: 12 })
    .map((fragments) => fragments.join(""));
  const hostileText = fc.oneof(
    fc.string({ maxLength: 300 }),
    fc.string({ unit: "binary", maxLength: 300 }),
    nearGrammar,
  );
  fc.assert(fc.property(hostileText, assertProperty), { numRuns: fuzzRunCount });
}
