import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const originalMigrationFile = "20260720213000_active_workout_aw2a_execution_state.sql";
const originalMigrationBytes = readFileSync(`supabase/migrations/${originalMigrationFile}`);
const originalMigration = originalMigrationBytes.toString("utf8").replaceAll("\r\n", "\n").toLowerCase();
const originalMigrationSha256 = createHash("sha256").update(originalMigrationBytes).digest("hex");
const migrationFiles = readdirSync("supabase/migrations")
  .filter((file) => file.includes("active_workout_aw2a_execution_state"))
  .sort();
const correctionMigrationFile = migrationFiles.find((file) => file.endsWith("_active_workout_aw2a_execution_state_corrections.sql"));
const correctionMigration = correctionMigrationFile
  ? readFileSync(`supabase/migrations/${correctionMigrationFile}`, "utf8").replaceAll("\r\n", "\n").toLowerCase()
  : "";
const legacyVerification = readFileSync(
  "supabase/verification/active-workout-aw2a-execution-state-legacy.sql",
  "utf8"
).replaceAll("\r\n", "\n").toLowerCase();
const verification = [
  readFileSync("supabase/verification/active-workout-aw2a-execution-state.sql", "utf8"),
  legacyVerification
].join("\n").replaceAll("\r\n", "\n").toLowerCase();
const repositoryText = [
  readFileSync("services/database/workout-session-execution.ts", "utf8"),
  readFileSync("lib/workouts/workout-session-execution.ts", "utf8"),
  readFileSync("lib/workouts/active-workout-device.ts", "utf8")
].join("\n").toLowerCase();

const requiredColumns = [
  "workout_session_id", "user_id", "state_version", "revision", "session_state", "view_state",
  "active_snapshot_item_id", "active_item_order", "active_set_number", "session_elapsed_seconds",
  "session_running_since", "rest_started_at", "rest_duration_seconds", "rest_ends_at",
  "controller_device_id", "bootstrap_source", "created_at", "updated_at"
];

describe("AW-2A persisted execution-state migration contract", () => {
  it("keeps the applied migration byte-immutable and adds one forward-only correction", () => {
    expect(originalMigrationSha256).toBe("c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e");
    expect(migrationFiles).toHaveLength(2);
    expect(migrationFiles[0]).toBe(originalMigrationFile);
    expect(correctionMigrationFile).toBeTruthy();
    expect(originalMigration.trimStart().startsWith("begin;")).toBe(true);
    expect(originalMigration.trimEnd().endsWith("commit;")).toBe(true);
    expect(correctionMigration.trimStart().startsWith("begin;")).toBe(true);
    expect(correctionMigration.trimEnd().endsWith("commit;")).toBe(true);
    expect(correctionMigration).not.toMatch(/drop\s+(?:table|column|schema|index)/);
    expect(correctionMigration).not.toMatch(/alter\s+table/);
  });

  it("contains the exact typed one-to-one state contract and no arbitrary state blob", () => {
    for (const column of requiredColumns) expect(originalMigration).toContain(column);
    expect(originalMigration).toContain("workout_session_id uuid primary key");
    expect(originalMigration).toContain("references public.workout_sessions(id) on delete cascade");
    expect(originalMigration).toContain("references public.workout_session_muscle_snapshot_items(id) on delete set null");
    expect(originalMigration).not.toMatch(/\bstate_json\b|\bpayload\s+jsonb\b|\bexecution_data\b/);
  });

  it("enforces ownership, revision, lifecycle, timers, and stable snapshot cursor", () => {
    for (const contract of [
      "workout_session_execution_states_integrity_guard",
      "initialize_workout_session_execution_state",
      "workout_session_execution_state_snapshot_initializer",
      "workout_session_execution_state_terminal_cleanup",
      "active execution cursor must reference the same user and workout session",
      "new.revision := old.revision + 1",
      "old.bootstrap_source = 'legacy_backfill' and new.bootstrap_source = 'client_cache_import'",
      "log.completed_at is not null",
      "item.source_plan_activity_id",
      "item.source_plan_exercise_id",
      "rest_ends_at = rest_started_at + make_interval"
    ]) expect(originalMigration).toContain(contract);
    expect(originalMigration).not.toMatch(/lower\([^\n]*exercise_name|exercise_name\s*=/);
  });

  it("adds a compact partial covering index for the active snapshot-item FK", () => {
    expect(correctionMigration).toContain("create index workout_session_execution_states_active_snapshot_item_idx");
    expect(correctionMigration).toContain("on public.workout_session_execution_states(active_snapshot_item_id)");
    expect(correctionMigration).toContain("where active_snapshot_item_id is not null");
    expect(correctionMigration).toContain("workout_session_execution_states_active_snapshot_item_id_fkey");
    expect(verification).toContain("aw-2a active snapshot-item fk covering index is missing or incorrect");
  });

  it("uses owner-scoped RLS and least-privilege grants", () => {
    expect(originalMigration).toContain("enable row level security");
    expect(originalMigration).toContain("workout_session_execution_states_member_select");
    expect(originalMigration).toContain("workout_session_execution_states_member_update");
    expect(originalMigration).toContain("grant select, update on table public.workout_session_execution_states\n  to authenticated");
    expect(originalMigration).not.toContain("grant insert on table public.workout_session_execution_states\n  to authenticated");
    expect(originalMigration).toContain("security definer\nset search_path = ''");
  });

  it("does not introduce AW-2B command, idempotency, timeline, or event models", () => {
    expect(`${originalMigration}\n${correctionMigration}`).not.toMatch(/create table public\.[^\s]*(?:command|operation|event|timeline)/);
    expect(`${originalMigration}\n${correctionMigration}`).not.toContain("operation_id");
    expect(`${originalMigration}\n${correctionMigration}`).not.toContain("expected_revision");
    expect(repositoryText).not.toContain("browser fingerprint");
    expect(repositoryText).not.toContain("useragent");
  });

  it("preserves the release compatibility marker and Activity Catalog boundary", () => {
    expect(originalMigration).not.toMatch(/update\s+public\.release_schema_compatibility/);
    expect(correctionMigration).not.toMatch(/update\s+public\.release_schema_compatibility/);
    expect(originalMigration).toContain("aw-2a changed the release compatibility marker");
    expect(correctionMigration).toContain("aw-2a correction changed the release compatibility marker");
    expect(`${originalMigration}\n${correctionMigration}`).not.toContain("khlcctuefiuhunqymkbp");
    expect(repositoryText).not.toContain("khlcctuefiuhunqymkbp");
  });

  it("keeps the legacy verification future-safe and read-only", () => {
    expect(legacyVerification).toContain("set local transaction read only");
    expect(legacyVerification).toContain("set_config('plaivra.aw2a_marker_baseline'");
    expect(legacyVerification).toContain("current_setting('plaivra.aw2a_marker_baseline', true)");
    expect(legacyVerification).toContain("v_marker_final is distinct from v_marker_baseline");
    expect(legacyVerification).toContain("aw-2a changed the release compatibility marker from % to %");
    expect(legacyVerification).not.toMatch(/\bv_marker(?:_final)?\s+not\s+in\s*\(/);
    expect(legacyVerification).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.release_schema_compatibility/
    );
    expect(legacyVerification).toContain("20260720213000");
    expect(legacyVerification).not.toContain("20260722161542");
  });

  it("ships permanent transactional verification for the production contract", () => {
    expect(verification.trimStart().startsWith("\\set on_error_stop on")).toBe(true);
    expect(verification).toMatch(/\nbegin;\n/);
    expect(verification.trimEnd().endsWith("rollback;")).toBe(true);
    for (const proof of [
      "open workout session is missing exactly one execution-state row",
      "terminal workout session retains execution state",
      "execution-state owner differs from root-session owner",
      "revision guard source contract is missing",
      "snapshot initializer source contract is missing",
      "terminal cleanup source contract is missing",
      "active snapshot-item fk covering index is missing or incorrect"
    ]) expect(verification).toContain(proof);
  });
});
