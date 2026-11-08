// Everything read from Roll20 comes from objects players can edit or chat anyone can post, so
// it arrives as unknown and is narrowed here, once, before any module relies on its shape.

export function isRecord(candidate: unknown): candidate is Readonly<Record<string, unknown>> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

export function readFiniteNumber(candidate: unknown): number | undefined {
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

export function readText(candidate: unknown): string | undefined {
  return typeof candidate === "string" ? candidate : undefined;
}

// The length of the value as JSON, or undefined when it cannot be measured, as for a cyclic one.
export function measureSerialisedLength(candidate: unknown): number | undefined {
  try {
    return JSON.stringify(candidate).length;
  } catch {
    return undefined;
  }
}
