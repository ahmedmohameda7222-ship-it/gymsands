import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260722070000_active_workout_aw2c_timeline_events.sql", import.meta.url),
  "utf8"
);
const verification = readFileSync(
  new URL("../../supabase/verification/active-workout-aw2c-timeline-events.sql", import.meta.url),
  "utf8"
).replaceAll("\r\n", "\n").toLowerCase();

const requiredEvents = [
  "session_started", "session_paused", "session_resumed", "rest_started", "rest_ended",
  "set_completed", "set_edited", "exercise_skipped", "exercise_replaced",
  "session_completed", "session_skipped", "session_cancelled"
];

describe("AW-2C durable timeline migration", () => {
  it("creates the bounded append-only timeline contract", () => {
    expect(migration).toContain("create table public.workout_session_timeline_events");
    expect(migration).toContain("sequence_number bigint generated always as identity");
    expect(migration).toContain("unique (workout_session_id, sequence_number)");
    expect(migration).toContain("unique (workout_session_id, idempotency_key)");
    expect(migration).toContain("octet_length(payload::text) <= 8192");
    expect(migration).toContain("alter table public.workout_session_timeline_events enable row level security");
    expect(migration).toContain("create policy workout_session_timeline_events_owner_select");
    expect(migration).toContain("private.append_workout_session_timeline_event");
    for (const event of requiredEvents) expect(migration).toContain(`'${event}'`);
  });

  it("keeps runtime writes inside reviewed atomic authorities", () => {
    for (const rpc of [
      "apply_workout_session_execution_command_atomic",
      "start_or_resume_workout_session_atomic",
      "start_or_resume_direct_workout_session_atomic",
      "upsert_workout_set_logs_atomic",
      "complete_workout_session_atomic",
      "replace_workout_session_snapshot_item_atomic",
      "skip_workout_session_snapshot_item_atomic",
      "cancel_workout_session_atomic",
      "skip_workout_day_atomic"
    ]) expect(migration).toContain(`public.${rpc}`);
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).not.toContain("max(sequence_number)");
  });

  it("adds durable cancellation without promoting release compatibility", () => {
    expect(migration).toMatch(/alter type public\.workout_session_status add value(?: if not exists)? 'cancelled'/);
    expect(migration).toContain("add column cancelled_at timestamptz");
    expect(migration).toContain("add column cancel_reason text");
    expect(migration).toContain("private.enforce_terminal_workout_session_delete");
    expect(migration).toContain("'20260721224813'");
    expect(migration).not.toMatch(/update\s+public\.release_schema_compatibility/i);
  });

  it("keeps permanent AW-2C verification future-safe", () => {
    expect(verification).toContain("select migration_version as aw2c_marker_baseline");
    expect(verification).toContain("migration_version=:'aw2c_marker_baseline'");
    expect(verification).toContain("changed the compatibility marker from its transaction baseline");
    expect(verification).not.toMatch(/migration_version\s*=\s*'20260721224813'/);
    expect(verification).not.toMatch(/migration_version\s+in\s*\(/);
    expect(verification).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.release_schema_compatibility/
    );
    expect(verification).toContain("20260722070000");
    expect(verification).not.toContain("20260722161542");
  });

  it("backfills only provable history and never targets Activity Catalog", () => {
    const backfill = migration.slice(
      migration.indexOf("insert into public.workout_session_timeline_events(workout_session_id,user_id,event_type,occurred_at,source,payload_version,payload,idempotency_key)"),
      migration.indexOf("do $aw2c_postconditions$")
    );
    expect(backfill).toContain("'migration_backfill'");
    expect(backfill).toContain("where log.completed_at is not null");
    expect(backfill).toContain("item.replacement_recorded_at is not null");
    expect(backfill).not.toContain("'exercise_skipped'");
    expect(migration).not.toContain("khlcctuefiuhunqymkbp");
  });
});
