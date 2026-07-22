import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260722070000_active_workout_aw2c_timeline_events.sql", import.meta.url),
  "utf8"
);

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
    expect(migration).toContain("alter type public.workout_session_status add value 'cancelled'");
    expect(migration).toContain("add column cancelled_at timestamptz");
    expect(migration).toContain("add column cancel_reason text");
    expect(migration).toContain("workout_sessions_terminal_delete_guard");
    expect(migration).toContain("'20260721224813'");
    expect(migration).not.toMatch(/update\s+public\.release_schema_compatibility/i);
  });

  it("backfills only provable history and never targets Activity Catalog", () => {
    expect(migration).toContain("source='migration_backfill'");
    expect(migration).toContain("where log.completed_at is not null");
    expect(migration).toContain("item.replacement_recorded_at is not null");
    expect(migration).toContain("Ambiguous snapshot state='skipped' rows are intentionally excluded");
    expect(migration).not.toContain("khlcctuefiuhunqymkbp");
  });
});
