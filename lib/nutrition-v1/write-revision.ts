/** A JSON optimistic-concurrency token must be an explicit safe integer. */
export function parseNonNegativeRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
