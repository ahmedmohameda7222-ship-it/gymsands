import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260726075737_active_workout_aw4_session_engine.sql",
  "utf8"
).replaceAll("\r\n", "\n").toLowerCase();
const verification = readFileSync(
  "supabase/verification/active-workout-aw4-session-engine.sql",
  "utf8"
).replaceAll("\r\n", "\n").toLowerCase();
const integration = readFileSync(
  "supabase/verification/active-workout-aw4-integration.sql",
  "utf8"
).replaceAll("\r\n", "\n").toLowerCase();
const databaseVerification = readFileSync(
  "scripts/run-database-verification.mjs",
  "utf8"
).replaceAll("\r\n", "\n").toLowerCase();

describe("AW-4 session-engine migration contract", () => {
  it("adds the exact safe activity-timer projection without a new table or state version", () => {
    for (const column of [
      "activity_timer_kind text null",
      "activity_timer_elapsed_seconds integer not null default 0",
      "activity_timer_running_since timestamptz null",
      "activity_timer_duration_seconds integer null",
      "activity_timer_ends_at timestamptz null"
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("activity_timer_kind = 'timed_set'");
    expect(migration).toContain("activity_timer_kind in ('timed_set', 'block')");
    expect(migration).toContain("activity_timer_duration_seconds between 0 and 86400");
    expect(migration).not.toMatch(/create\s+table[^;]*activity_timer/);
    expect(migration).not.toMatch(/set\s+state_version\s*=/);
  });

  it("extends the existing atomic authority and retains bounded exact-key validation", () => {
    for (const command of [
      "start_activity_timer",
      "clear_activity_timer",
      "reset_activity_timer"
    ]) {
      expect(migration).toContain(`'${command}'`);
    }
    expect(migration).toContain(
      "create or replace function public.apply_workout_session_execution_command_atomic("
    );
    expect(migration).toContain(
      "create or replace function private.aw2c_core_apply_workout_session_execution_command_atomic("
    );
    expect(migration).toContain("pg_column_size(v_payload) > 4096");
    expect(migration).toContain("payload contains an unsupported key");
    expect(migration).toContain("command_id_reused_with_different_request");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("clock_timestamp()");
  });

  it("atomically freezes and resumes all three timers with bounded reason enums", () => {
    for (const value of [
      "natural_expiration",
      "user_skipped",
      "transitioned",
      "completed",
      "cancelled",
      "session_paused",
      "session_resumed"
    ]) {
      expect(migration).toContain(value);
    }
    expect(migration).toContain("activity_timer_running_since = v_target_activity_running_since");
    expect(migration).toContain("activity_timer_ends_at = v_target_activity_ends_at");
  });

  it("preserves reviewed grants, direct-write denial, and the compatibility marker", () => {
    expect(migration).toContain(
      "revoke all on function public.apply_workout_session_execution_command_atomic("
    );
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete|all)[^;]*workout_session_execution_states/
    );
    expect(migration).not.toMatch(/update\s+public\.release_schema_compatibility/);
    expect(migration).toContain("migration_version = '20260724232734'");
  });

  it("keeps permanent schema and integration proofs in the centralized database contract", () => {
    expect(verification).toContain("activity timer columns do not match the exact additive contract");
    expect(verification).toContain("authenticated direct mutation access exists");
    expect(verification).toContain("aw-4 compatibility marker changed");
    expect(integration).toContain("pause did not atomically freeze session, rest, and activity timers");
    expect(integration).toContain("replay, idempotency conflict, or revision conflict");
    expect(integration).toContain("terminal cleanup retained execution authority");
    expect(integration).toContain("authenticated direct execution-state update succeeded");
    const aw3c = databaseVerification.indexOf("active-workout-aw3c-integration.sql");
    const aw4Schema = databaseVerification.indexOf("active-workout-aw4-session-engine.sql");
    const aw4Integration = databaseVerification.indexOf("active-workout-aw4-integration.sql");
    const genericPreflight = databaseVerification.indexOf("production-release-migration-preflight.sql");
    expect(aw3c).toBeGreaterThanOrEqual(0);
    expect(aw4Schema).toBeGreaterThan(aw3c);
    expect(aw4Integration).toBeGreaterThan(aw4Schema);
    expect(genericPreflight).toBeGreaterThan(aw4Integration);
  });
});
