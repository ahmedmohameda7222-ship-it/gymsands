import { createHash } from "node:crypto";

import { validateAdvancedMuscleMappingEntries, type AdvancedMuscleMappingEntry } from "./advanced-exposure";
import { ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION } from "./versions";

export function canonicalizeAdvancedMuscleMapping(entries: readonly AdvancedMuscleMappingEntry[]): string {
  const normalizedEntries = validateAdvancedMuscleMappingEntries(entries, { requirePrimary: true }).map((entry) => ({
    muscle_id: entry.muscleId,
    role: entry.role,
    contribution: entry.contribution.toFixed(2),
    side_scope: entry.sideScope,
    sort_order: entry.sortOrder
  }));
  return JSON.stringify({
    schema_version: ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION,
    entries: normalizedEntries
  });
}

export function calculateAdvancedMuscleMappingChecksum(entries: readonly AdvancedMuscleMappingEntry[]): string {
  return createHash("sha256").update(canonicalizeAdvancedMuscleMapping(entries), "utf8").digest("hex");
}
