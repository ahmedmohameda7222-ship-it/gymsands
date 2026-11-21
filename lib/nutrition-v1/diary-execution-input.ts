/** Distinguish optional JSON objects from invalid snapshot payloads at the Diary API boundary. */
export function isOptionalDiaryExecutionSnapshot(value: unknown): value is Record<string, unknown> | null | undefined {
  return value === null || value === undefined ||
    (typeof value === "object" && !Array.isArray(value));
}
