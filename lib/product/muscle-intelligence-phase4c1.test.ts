import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260719223000_muscle_intelligence_phase4c1_runtime_v2_cutover.sql";
const historyGuardMigrationPath = "supabase/migrations/20260719223100_muscle_intelligence_phase4c1_terminal_history_guard.sql";

function text(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Muscle Intelligence Phase 4C.1 runtime cutover", () => {
  it("keeps existing V1 history and cuts only new sessions to the exact V2 bundle", () => {
    const migration = text(migrationPath);
    expect(migration).toContain("Existing V1 snapshot envelopes");
    expect(migration).toContain("workout_session_muscle_snapshot_v2");
    expect(migration).toContain("advanced_visible_v1");
    expect(migration).toContain("exercise_muscle_mapping_v2");
    expect(migration).toContain("muscle_load_resistance_sets_v2");
    expect(migration).toContain("advanced_exposure_v1");
    expect(migration).toContain("advanced_muscle_exposure_result_v1");
    expect(migration).toContain("private.freeze_workout_session_muscle_snapshot_v2");
    expect(migration).toContain("private.assert_phase3_snapshot_v1");
    expect(migration).not.toMatch(/update\s+public\.workout_session_muscle_snapshots\s+set\s+snapshot_schema_version/i);
  });

  it("stores structured set type and freezes terminal performed workload", () => {
    const migration = text(migrationPath);
    expect(migration).toContain("add column set_type text");
    expect(migration).toContain("'normal', 'warmup', 'working', 'failure', 'drop'");
    expect(migration).toContain("performed_total_sets");
    expect(migration).toContain("performed_qualifying_sets");
    expect(migration).toContain("performed_frozen_at");
    expect(migration).toContain("log.set_type <> 'warmup'");
    expect(migration).toContain("exercise_logs_terminal_immutable");
    expect(migration).toContain("Completed workout set logs are immutable.");
  });

  it("preserves V1 replacement behavior while resolving V2 replacements by snapshot version", () => {
    const migration = text(migrationPath);
    expect(migration).toContain("private.resolve_muscle_mapping(v_global.id, v_snapshot.mapping_schema_version, v_now)");
    expect(migration).toContain("private.resolve_custom_muscle_mapping(p_user_id, v_custom.id, v_snapshot.mapping_schema_version, v_now)");
    expect(migration).toContain("v_snapshot_version = 'v1'");
    expect(migration).toContain("replacement_mapping_unavailable");
  });

  it("protects the parent terminal session while retaining trusted privacy purge", () => {
    const guardMigration = text(historyGuardMigrationPath);
    expect(guardMigration).toContain("workout_sessions_terminal_delete_guard");
    expect(guardMigration).toContain("old.status = 'started'");
    expect(guardMigration).toContain("current_user in ('postgres', 'supabase_admin', 'service_role')");
    expect(guardMigration).toContain("Delete the account through the privacy workflow instead");
  });

  it("does not advance the coordinated compatibility marker", () => {
    const migrations = `${text(migrationPath)}\n${text(historyGuardMigrationPath)}`;
    expect(migrations).toContain("Compatibility marker changed during Phase 4C.1 implementation");
    expect(migrations).not.toMatch(/update\s+public\.release_schema_compatibility/i);
  });

  it("makes completed V2 analysis independent from mutable exercise logs", () => {
    const sessionAnalysis = text("lib/train/muscle-intelligence/session-analysis.ts");
    const advancedAnalysis = text("lib/train/muscle-intelligence/advanced-session-analysis.ts");
    expect(sessionAnalysis).toContain('mode === "completed" && snapshotVersion === "v1"');
    expect(sessionAnalysis).toContain("performed_qualifying_sets");
    expect(advancedAnalysis).toContain("snapshot_workload_not_frozen");
    expect(advancedAnalysis).toContain("item.performed_qualifying_sets");
  });

  it("ships an independent database verification contract", () => {
    const verification = text("supabase/verification/muscle-intelligence-phase4c1.sql");
    expect(verification).toContain("exercise_logs_terminal_immutable");
    expect(verification).toContain("workout_sessions_terminal_delete_guard");
    expect(verification).toContain("terminal V2 session is missing immutable performed workload");
    expect(verification).toContain("Phase 4C.1 must not advance the compatibility marker independently");
  });
});
