import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { decodeWorkoutHistoryCursor } from "@/lib/workouts/history/cursor";
import { listWorkoutHistoryKeyset } from "@/services/workouts/history/server-list-reader";

const userId = "11111111-1111-4111-8111-111111111111";
const firstId = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";
const snapshotId = "44444444-4444-4444-8444-444444444444";
const mappingId = "55555555-5555-4555-8555-555555555555";
const secret = "workout-history-keyset-test-secret-at-least-32-characters";

function clientFor(rootPages: Array<Record<string, unknown>[]>) {
  const calls: Array<{ kind: "rpc" | "table"; name: string; values?: unknown }> = [];
  let pageIndex = 0;
  const rows: Record<string, Record<string, unknown>[]> = {
    workout_sessions: [
      {
        id: firstId,
        user_id: userId,
        scheduled_session_id: null,
        workout_name: "First session",
        workout_day_name: null,
        workout_category: "strength",
        started_at: "2026-08-10T08:00:00.000Z",
        completed_at: "2026-08-10T09:00:00.000Z",
        skipped_at: null,
        cancelled_at: null,
        duration_minutes: 60,
        notes: null,
        status: "completed",
        plan_id: null,
        plan_day_id: null,
        plan_week_id: null,
        plan_session_id: null,
        deleted_at: null,
        derived_record_schema_version: 1,
        derived_record_formula_version: "wh6-v1",
        derived_records_evaluated_at: "2026-08-10T09:01:00.000Z",
      },
      {
        id: secondId,
        user_id: userId,
        scheduled_session_id: null,
        workout_name: "Second session",
        workout_day_name: null,
        workout_category: "strength",
        started_at: "2026-08-09T08:00:00.000Z",
        completed_at: "2026-08-09T09:00:00.000Z",
        skipped_at: null,
        cancelled_at: null,
        duration_minutes: 55,
        notes: null,
        status: "completed",
        plan_id: null,
        plan_day_id: null,
        plan_week_id: null,
        plan_session_id: null,
        deleted_at: null,
      },
    ],
    exercise_logs: [{
      id: "66666666-6666-4666-8666-666666666666",
      workout_session_id: firstId,
      plan_exercise_id: "77777777-7777-4777-8777-777777777777",
      plan_activity_id: null,
      exercise_order: 1,
      exercise_name: "Bench press",
      set_number: 1,
      reps: 10,
      weight_kg: 50,
      completed_at: "2026-08-10T08:30:00.000Z",
      set_type: "working",
      performance_metrics: [
        { metric_key: "repetitions", value: 10, side: "none" },
        { metric_key: "external_load_kg", value: 50, side: "none" },
      ],
      set_details: { set_type: "working", rpe: 8, rir: 2 },
      segments: [],
    }],
    workout_session_muscle_snapshots: [{ id: snapshotId, workout_session_id: firstId }],
    workout_session_muscle_snapshot_items: [{
      snapshot_id: snapshotId,
      source_plan_exercise_id: "77777777-7777-4777-8777-777777777777",
      source_plan_activity_id: null,
      activity_name_snapshot: "Bench press",
      actual_name_snapshot: null,
      planned_global_exercise_id: null,
      actual_global_exercise_id: "88888888-8888-4888-8888-888888888888",
      planned_custom_exercise_id: null,
      actual_custom_exercise_id: null,
      planned_provider: null,
      actual_provider: null,
      planned_provider_activity_id: null,
      actual_provider_activity_id: null,
      planned_mapping_set_id: null,
      actual_mapping_set_id: mappingId,
      planned_custom_mapping_entries: null,
      actual_custom_mapping_entries: null,
      performed_total_sets: 1,
    }],
    exercise_muscle_mapping_entries: [{ mapping_set_id: mappingId, muscle_id: "pectoralis_major" }],
    current_personal_records: [{ workout_session_id: firstId }],
    user_workout_sessions: [],
    user_workout_plans: [],
  };

  const client = {
    rpc: vi.fn(async (name: string, parameters: Record<string, unknown>) => {
      calls.push({ kind: "rpc", name, values: parameters });
      if (name === "get_workout_history_period_summary_v1") {
        return {
          data: [{
            eligible_workout_count: 2,
            trusted_duration_minutes: 115,
            completed_set_count: 2,
            reliable_volume: null,
            verified_record_count: 1,
          }],
          error: null,
        };
      }
      const data = rootPages[Math.min(pageIndex, rootPages.length - 1)] ?? [];
      pageIndex += 1;
      return { data, error: null };
    }),
    from: vi.fn((table: string) => {
      const filters = new Map<string, unknown[]>();
      const equalities = new Map<string, unknown>();
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((field: string, value: unknown) => {
        equalities.set(field, value);
        return builder;
      });
      builder.in = vi.fn((field: string, values: unknown[]) => {
        filters.set(field, values);
        calls.push({ kind: "table", name: table, values: { field, values } });
        return builder;
      });
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        const selected = (rows[table] ?? []).filter((row) =>
          [...equalities].every(([field, value]) => row[field] === value)
          && [...filters].every(([field, values]) => values.includes(row[field])));
        return Promise.resolve({ data: selected, error: null }).then(resolve, reject);
      };
      return builder;
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function root(id: string, effectiveAt: string, durationMinutes: number) {
  return {
    source_kind: "performed",
    root_id: id,
    activity_id: id,
    effective_at: effectiveAt,
    duration_minutes: durationMinutes,
    lifecycle: "completed",
    completed_set_count: 1,
    structured_metric_count: 2,
    actual_snapshot_count: 1,
    planned_set_count: 1,
  };
}

describe("Workout History keyset list reader", () => {
  it("loads child graphs only for the emitted root page", async () => {
    const first = root(firstId, "2026-08-10T09:00:00.000Z", 60);
    const second = root(secondId, "2026-08-09T09:00:00.000Z", 55);
    const { client, calls } = clientFor([[first, second]]);
    const response = await listWorkoutHistoryKeyset(client, userId, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
      limit: 1,
      statuses: ["completed"],
      sort: "newest",
    }, secret);

    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      canonicalSessionId: firstId,
      reliableVolume: 500,
      completedSetCount: 1,
      muscleIds: ["pectoralis_major"],
      verifiedRecordCount: 1,
    });
    expect(response.summary).toEqual({
      eligibleWorkoutCount: 2,
      trustedDurationMinutes: 115,
      completedSetCount: 2,
      reliableVolume: null,
      verifiedRecordCount: 1,
    });
    expect(response.nextCursor).not.toBeNull();
    const childCalls = calls.filter((call) => call.kind === "table");
    expect(childCalls.some((call) => JSON.stringify(call.values).includes(secondId))).toBe(false);
    expect(childCalls.some((call) => JSON.stringify(call.values).includes(firstId))).toBe(true);
  });

  it("passes the signed cursor boundary into the database page RPC", async () => {
    const first = root(firstId, "2026-08-10T09:00:00.000Z", 60);
    const second = root(secondId, "2026-08-09T09:00:00.000Z", 55);
    const initial = clientFor([[first, second]]);
    const pageOne = await listWorkoutHistoryKeyset(initial.client, userId, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
      limit: 1,
      statuses: ["completed"],
      sort: "newest",
    }, secret);
    const cursor = decodeWorkoutHistoryCursor(pageOne.nextCursor!, secret);

    const next = clientFor([[second]]);
    await listWorkoutHistoryKeyset(next.client, userId, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
      limit: 1,
      statuses: ["completed"],
      sort: "newest",
      cursor: pageOne.nextCursor!,
    }, secret);
    const pageRpc = next.calls.find((call) =>
      call.kind === "rpc" && call.name === "get_workout_history_root_page_v1");
    expect(pageRpc?.values).toMatchObject({
      p_cursor_effective_at: cursor.effectiveAt,
      p_cursor_activity_id: cursor.activityId,
      p_cursor_duration_minutes: cursor.durationMinutes,
      p_limit: 2,
    });
  });
});
