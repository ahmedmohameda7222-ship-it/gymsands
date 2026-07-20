import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationFile = "20260720213000_active_workout_aw2a_execution_state.sql";
const migration = readFileSync(`supabase/migrations/${migrationFile}`, "utf8").replaceAll("\r\n", "\n").toLowerCase();
const verification = readFileSync("supabase/verification/active-workout-aw2a-execution-state.sql", "utf8").replaceAll("\r\n", "\n").toLowerCase();
const migrationFiles = readdirSync("supabase/migrations").filter((file) => file.includes("active_workout_aw2a_execution_state"));
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
  it("ships exactly one append-only forward transaction under the canonical root", () => {
    expect(migrationFiles).toEqual([migrationFile]);
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("create table public.workout_session_execution_states");
    expect(migration).not.toMatch(/create table public\.(?:workout_sessions|exercise_logs|user_workout_sessions)/);
    expect(migration).not.toMatch(/drop\s+(?:table|column|schema)/);
  });

  it("contains the exact typed one-to-one state contract and no arbitrary state blob", () => {
    for (const column of requiredColumns) expect(migration).toContain(column);
    expect(migration).toContain("workout_session_id uuid primary key");
    expect(migration).toContain("references public.workout_sessions(id) on delete cascade");
    expect(migration).toContain("references public.workout_session_muscle_snapshot_items(id) on delete set null");
    expect(migration).not.toMatch(/\bstate_json\b|\bpayload\s+jsonb\b|\bexecution_data\b/);
  });

  it("enforces ownership, revision, lifecycle, timers, and stable snapshot cursor", () => {
    for (const contract of [
      "workout_session_execution_states_integrity_guard",
      "initialize_workout_session_execution_state",
      "workout_session_execution_state_snapshot_initializer",
      "workout_session_execution_state_terminal_cleanup",
      "active execution cursor must reference the same user and workout session",
      "new.revision := old.revision + 1",
      "log.completed_at is not null",
      "item.source_plan_activity_id",
      "item.source_plan_exercise_id",
      "rest_ends_at = rest_started_at + make_interval"
    ]) expect(migration).toContain(contract);
    expect(migration).not.toMatch(/lower\([^\n]*exercise_name|exercise_name\s*=/);
  });

  it("uses owner-scoped RLS and least-privilege grants", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("workout_session_execution_states_member_select");
    expect(migration).toContain("workout_session_execution_states_member_update");
    expect(migration).toContain("grant select, update on table public.workout_session_execution_states\n  to authenticated");
    expect(migration).not.toContain("grant insert on table public.workout_session_execution_states\n  to authenticated");
    expect(migration).toContain("security definer\nset search_path = ''");
  });

  it("does not introduce AW-2B command, idempotency, timeline, or event models", () => {
    expect(migration).not.toMatch(/create table public\.[^\s]*(?:command|operation|event|timeline)/);
    expect(migration).not.toContain("operation_id");
    expect(migration).not.toContain("expected_revision");
    expect(repositoryText).not.toContain("browser fingerprint");
    expect(repositoryText).not.toContain("useragent");
  });

  it("preserves the release compatibility marker and Activity Catalog boundary", () => {
    expect(migration).not.toMatch(/update\s+public\.release_schema_compatibility/);
    expect(migration).toContain("aw-2a changed the release compatibility marker");
    expect(migration).not.toContain("khlcctuefiuhunqymkbp");
    expect(repositoryText).not.toContain("khlcctuefiuhunqymkbp");
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
      "terminal cleanup source contract is missing"
    ]) expect(verification).toContain(proof);
  });
});
