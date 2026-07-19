import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve("supabase/migrations/20260718214000_muscle_intelligence_phase4a_advanced_atlas_foundation.sql");
const verificationPath = resolve("supabase/verification/muscle-intelligence-phase4a.sql");
const correctionMigrationPath = resolve("supabase/migrations/20260719000336_muscle_intelligence_phase4a_required_corrections.sql");
const correctionVerificationPath = resolve("supabase/verification/muscle-intelligence-phase4a-required-corrections.sql");
const migration = readFileSync(migrationPath, "utf8");
const correction = readFileSync(correctionMigrationPath, "utf8");

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

  it("keeps the applied foundation migration immutable and adds a forward-only correction", () => {
    expect(createHash("sha256").update(migration).digest("hex")).toBe(
      "9b0d14c6711b98deced194a7e2d7fd08979a34470ef3126f4912f1865918a630"
    );
    expect(correction).toMatch(/^begin;/);
    expect(correction).toMatch(/commit;\s*$/);
    expect(correction).toContain("(exercise_id, schema_version)");
    expect(correction).toContain("(custom_exercise_id, schema_version)");
    expect(correction).toMatch(/new\.schema_version is distinct from old\.schema_version/g);
    expect(correction).toContain("schema_version = target.schema_version");
  });

  it("uses a fail-closed version-aware resolver and explicitly pins every current writer to V1", () => {
    expect(correction).toContain("private.resolve_muscle_mapping");
    expect(correction).toContain("private.resolve_custom_muscle_mapping");
    expect(correction).toContain("p_schema_version not in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2')");
    expect(correction).toContain("'Unsupported muscle mapping schema.' using errcode = '23514'");
    for (const boundary of [
      "freeze_workout_session_muscle_snapshot_phase3_integrity_v1",
      "freeze_workout_session_muscle_snapshot",
      "start_or_resume_direct_workout_session_atomic",
      "replace_workout_session_snapshot_item_atomic",
      "get_workout_replacement_candidate_eligibility",
      "phase3_reconcile_terminal_session",
      "get_workout_session_frozen_global_mappings"
    ]) expect(correction).toContain(boundary);
    expect(correction.match(/'exercise_muscle_mapping_v1'/g)?.length).toBeGreaterThan(20);
  });

  it("executes correction proofs transactionally against real functions and triggers", () => {
    const verification = readFileSync(correctionVerificationPath, "utf8");
    expect(verification).toMatch(/^begin;/);
    expect(verification).toMatch(/rollback;\s*$/);
    for (const proof of [
      "assert_global_schema_flip_rejected",
      "assert_custom_schema_flip_rejected",
      "assert_unsupported_resolver_rejected",
      "publish_exercise_muscle_mapping_set",
      "publish_user_custom_exercise_mapping_set",
      "start_or_resume_workout_session_atomic",
      "start_or_resume_direct_workout_session_atomic",
      "replace_workout_session_snapshot_item_atomic",
      "Historical V1 snapshots changed"
    ]) expect(verification).toContain(proof);
  });
});
