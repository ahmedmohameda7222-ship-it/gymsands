import { createHash } from "node:crypto";
import { sortMuscleMappingEntries, validateMuscleMappingEntries, type MuscleMappingEntry } from "./contracts";
import { MUSCLE_MAPPING_SCHEMA_VERSION } from "./versions";

export function canonicalizeMuscleMapping(entries: readonly MuscleMappingEntry[]): string {
  const normalizedEntries = sortMuscleMappingEntries(validateMuscleMappingEntries(entries)).map((entry) => ({
    muscle_id: entry.muscleId,
    role: entry.role,
    contribution: entry.contribution.toFixed(2),
    side_scope: entry.sideScope,
    sort_order: entry.sortOrder
  }));
  return JSON.stringify({ schema_version: MUSCLE_MAPPING_SCHEMA_VERSION, entries: normalizedEntries });
}

export function calculateMuscleMappingChecksum(entries: readonly MuscleMappingEntry[]): string {
  return createHash("sha256").update(canonicalizeMuscleMapping(entries), "utf8").digest("hex");
}
