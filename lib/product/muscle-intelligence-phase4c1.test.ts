import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeMigrationPaths = [
  "supabase/migrations/20260719223000_muscle_intelligence_phase4c1_runtime_v2_cutover.sql",
  "supabase/migrations/20260719223010_muscle_intelligence_phase4c1_snapshot_support.sql",
  "supabase/migrations/20260719223020_muscle_intelligence_phase4c1_v2_snapshot_freeze.sql",
  "supabase/migrations/20260719223030_muscle_intelligence_phase4c1_direct_session_v2.sql",
  "supabase/migrations/20260719223040_muscle_intelligence_phase4c1_replacement_v2.sql",
  "supabase/migrations/20260719223050_muscle_intelligence_phase4c1_terminal_reconcile_v2.sql"
] as const;
const historyGuardMigrationPath = "supabase/migrations/20260719223100_muscle_intelligence_phase4c1_terminal_history_guard.sql";

function text(path: string): string {
  return readFileSync(path, "utf8");
}

function runtimeMigrations(): string {
  return runtimeMigrationPaths.map(text).join("\n");
}

describe("Muscle Intelligence Phase 4C.1 runtime cutover", () => {
  it("keeps existing V1 history and cuts only new sessions to the exact V2 bundle", () => {
    const migrations = runtimeMigrations();
    expect(migrations).toContain("Existing V1 snapshot envelopes");
    expect(migrations).toContain("workout_session_muscle_snapshot_v2");
    expect(migrations).toContain("advanced_visible_v1");
    expect(migrations).toContain("exercise_muscle_mapping_v2");
    expect(migrations).toContain("muscle_load_resistance_sets_v2");
    expect(migrations).toContain("advanced_exposure_v1");
    expect(migrations).toContain("advanced_muscle_exposure_result_v1");
    expect(migrations).toContain("private.freeze_workout_session_muscle_snapshot_v2");
    expect(migrations).toContain("private.assert_phase3_snapshot_v1");
    expect(migrations).not.toMatch(/update\s+public\.workout_session_muscle_snapshots\s+set\s+snapshot_schema_version/i);
  });

  it("stores structured set type and freezes terminal performed workload", () => {
    const migrations = runtimeMigrations();
    expect(migrations).toContain("add column set_type text");
    expect(migrations).toContain("'normal', 'warmup', 'working', 'failure', 'drop'");
    expect(migrations).toContain("performed_total_sets");
    expect(migrations).toContain("performed_qualifying_sets");
    expect(migrations).toContain("performed_frozen_at");
    expect(migrations).toContain("log.set_type <> 'warmup'");
    expect(migrations).toContain("exercise_logs_terminal_immutable");
    expect(migrations).toContain("Completed workout set logs are immutable.");
  });

  it("preserves V1 replacement behavior while resolving V2 replacements by snapshot version", () => {
    const migrations = runtimeMigrations();
    expect(migrations).toContain("private.resolve_muscle_mapping(v_global.id, v_snapshot.mapping_schema_version, v_now)");
    expect(migrations).toContain("private.resolve_custom_muscle_mapping(p_user_id, v_custom.id, v_snapshot.mapping_schema_version, v_now)");
    expect(migrations).toContain("v_snapshot_version = 'v1'");
    expect(migrations).toContain("replacement_mapping_unavailable");
  });

  it("keeps every split runtime authority ordered before terminal hardening", () => {
    const ordered = [...runtimeMigrationPaths, historyGuardMigrationPath];
    expect(ordered).toEqual([...ordered].sort());
    expect(runtimeMigrationPaths).toHaveLength(6);
  });

  it("protects the parent terminal session while retaining trusted privacy purge", () => {
    const guardMigration = text(historyGuardMigrationPath);
    expect(guardMigration).toContain("workout_sessions_terminal_delete_guard");
    expect(guardMigration).toContain("old.status = 'started'");
    expect(guardMigration).toContain("current_user in ('postgres', 'supabase_admin', 'service_role')");
    expect(guardMigration).toContain("Delete the account through the privacy workflow instead");
  });

  it("does not advance the coordinated compatibility marker", () => {
    const migrations = `${runtimeMigrations()}\n${text(historyGuardMigrationPath)}`;
    expect(migrations).toContain("Compatibility marker changed during Phase 4C.1 runtime schema migration");
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
    expect(verification).toContain("20260711014500");
    expect(verification).toContain("20260717051011");
    expect(verification).toContain("unsupported compatibility marker");
    expect(verification).not.toMatch(/update\s+public\.release_schema_compatibility/i);
  });
});
