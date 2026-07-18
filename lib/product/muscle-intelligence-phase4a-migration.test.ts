import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve("supabase/migrations/20260718214000_muscle_intelligence_phase4a_advanced_atlas_foundation.sql");
const verificationPath = resolve("supabase/verification/muscle-intelligence-phase4a.sql");
const migration = readFileSync(migrationPath, "utf8");

describe("Phase 4A forward-only migration", () => {
  it("adds V2 mapping support with schema-specific fail-closed guards", () => {
    expect(migration).toContain("exercise_muscle_mapping_v2");
    expect(migration).toContain("private.advanced_muscle_taxonomy_display_order");
    expect(migration).toContain("private.muscle_mapping_display_order");
    expect(migration).toContain("enforce_global_mapping_entry_schema");
    expect(migration).toContain("enforce_custom_mapping_entry_schema");
    expect(migration).toMatch(/v_schema not in \('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2'\)/);
    expect(migration).not.toMatch(/disable row level security|drop policy/i);
  });

  it("contains the exact 56-entry advanced order and version-aware checksums", () => {
    const orderBody = migration.slice(
      migration.indexOf("create or replace function private.advanced_muscle_taxonomy_display_order"),
      migration.indexOf("create or replace function private.muscle_mapping_display_order")
    );
    expect(orderBody.match(/when '[^']+' then \d+/g)).toHaveLength(56);
    expect(orderBody).toContain("when 'calf.soleus' then 56");
    expect(migration.match(/private\.muscle_mapping_display_order\(v_schema, entry\.muscle_id\)/g)).toHaveLength(2);
    expect(migration).toContain("'{\"schema_version\":' || to_json(v_schema)::text");
  });

  it("accepts only internally consistent V1 and V2 snapshot bundles while leaving V1 defaults untouched", () => {
    expect(migration).toContain("workout_session_muscle_snapshots_version_bundle_check");
    expect(migration).toContain("workout_session_muscle_snapshot_v1");
    expect(migration).toContain("workout_session_muscle_snapshot_v2");
    expect(migration).toContain("advanced_visible_v1");
    expect(migration).not.toMatch(/alter column snapshot_schema_version set default/i);
    expect(migration).not.toContain("release compatibility");
  });

  it("ships an explicit transactional verification script", () => {
    const verification = readFileSync(verificationPath, "utf8");
    expect(verification).toMatch(/^begin;/m);
    expect(verification).toMatch(/rollback;\s*$/);
    for (const proof of [
      "v1_accepts_broad", "v1_rejects_advanced", "v2_accepts_advanced", "v2_rejects_broad",
      "v1_checksum_unchanged", "v2_checksum_deterministic", "mixed_snapshot_rejected",
      "defaults_remain_v1", "no_visual_payload_in_database", "pre-existing V2 mapping publication detected"
    ]) expect(verification).toContain(proof);
  });
});
