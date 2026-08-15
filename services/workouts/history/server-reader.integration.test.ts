import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { listWorkoutHistory } from "@/services/workouts/history/server-reader";
import type { WorkoutHistoryListRequest } from "@/types/workout-history";

const ownerId = "11111111-1111-4111-8111-111111111111";
const performedId = "22222222-2222-4222-8222-222222222222";
const scheduledId = "33333333-3333-4333-8333-333333333333";
const snapshotId = "99999999-9999-4999-8999-999999999999";
const mappingSetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secret = "integration-test-history-secret-at-least-32-characters";

function queryClient(rows: Record<string, unknown[]>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    rpc: vi.fn(async (name: string) => name === "get_workout_history_pr_projection_inputs_v1"
      ? { data: rows.personal_records ?? [], error: null }
      : { data: null, error: { message: `Unexpected RPC: ${name}` } }),
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      const equalities = new Map<string, unknown>();
      for (const method of ["select", "in", "order", "or", "not"] as const) {
        builder[method] = vi.fn((...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        });
      }
      builder.eq = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: "eq", args });
        equalities.set(String(args[0]), args[1]);
        return builder;
      });
      builder.is = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: "is", args });
        equalities.set(String(args[0]), args[1]);
        return builder;
      });
      builder.range = vi.fn((from: number, to: number) => {
        calls.push({ table, method: "range", args: [from, to] });
        const selected = (rows[table] ?? []).filter((row) =>
          [...equalities].every(([key, value]) => {
            const actual = (row as Record<string, unknown>)[key];
            return value === null ? actual == null : actual === value;
          }));
        return Promise.resolve({ data: selected, error: null });
      });
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject);
      return builder;
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("Workout History server list integration", () => {
  it("batches compact owner-scoped sources, suppresses linked fallback, and pages deterministically", async () => {
    const { client, calls } = queryClient({
      workout_sessions: [{
        id: performedId,
        user_id: ownerId,
        scheduled_session_id: scheduledId,
        workout_name: "Push day",
        workout_day_name: null,
        workout_category: "strength",
        started_at: "2026-08-03T08:00:00.000Z",
        completed_at: "2026-08-03T09:00:00.000Z",
        skipped_at: null,
        cancelled_at: null,
        duration_minutes: 60,
        notes: null,
        status: "completed",
        plan_id: null,
        plan_day_id: null,
        plan_week_id: null,
        plan_session_id: null,
      }],
      user_workout_sessions: [{
        id: scheduledId,
        user_id: ownerId,
        user_workout_plan_id: null,
        plan_day_id: null,
        plan_week_id: null,
        plan_session_id: null,
        scheduled_date: "2026-08-03",
        day_title: "Push day",
        status: "completed",
        started_at: null,
        completed_at: "2026-08-03T09:00:00.000Z",
        skipped_at: null,
        duration_minutes: null,
        notes: null,
      }],
      exercise_logs: [{
        id: "44444444-4444-4444-8444-444444444444",
        workout_session_id: performedId,
        plan_exercise_id: "55555555-5555-4555-8555-555555555555",
        plan_activity_id: null,
        exercise_order: 0,
        exercise_name: "Bench press",
        exercise_category: "strength",
        set_number: 1,
        reps: 10,
        weight_kg: 50,
        notes: null,
        completed_at: "2026-08-03T08:30:00.000Z",
      }],
      exercise_log_metric_values: [],
      workout_session_prescription_sets: [],
      workout_session_muscle_snapshots: [{ id: snapshotId, workout_session_id: performedId }],
      workout_session_muscle_snapshot_items: [{
        snapshot_id: snapshotId,
        source_plan_exercise_id: "55555555-5555-4555-8555-555555555555",
        source_plan_activity_id: null,
        activity_name_snapshot: "Bench press",
        planned_global_exercise_id: null,
        actual_global_exercise_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        planned_mapping_set_id: null,
        actual_mapping_set_id: mappingSetId,
        planned_custom_mapping_entries: null,
        actual_custom_mapping_entries: null,
        planned_sets: 3,
        performed_total_sets: 1,
      }],
      exercise_muscle_mapping_entries: [{
        mapping_set_id: mappingSetId,
        muscle_id: "pectoralis_major_sternal",
      }],
    });

    const result = await listWorkoutHistory(client, ownerId, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
      limit: 1,
      statuses: ["completed"],
      sort: "newest",
    }, secret);

    expect(result.items).toHaveLength(1);
    expect(result.summary).toMatchObject({
      eligibleWorkoutCount: 1,
      completedSetCount: 1,
      reliableVolume: 500,
    });
    expect(result.items[0]).toMatchObject({
      sourceKind: "performed",
      exerciseCount: 1,
      completedSetCount: 1,
      muscleIds: ["pectoralis_major_sternal"],
    });
    expect(result.nextCursor).toBeNull();
    expect(calls).toContainEqual({ table: "workout_sessions", method: "eq", args: ["user_id", ownerId] });
    expect(calls).toContainEqual({ table: "user_workout_sessions", method: "eq", args: ["user_id", ownerId] });
    expect(calls.filter((call) => call.table === "exercise_logs" && call.method === "select")[0]?.args[0])
      .not.toContain("*");
    expect(calls.some((call) => call.table === "user_exercise_logs")).toBe(false);
  });

  it("uses identity as the equal-timestamp tie breaker and keeps full-period summary across pages", async () => {
    const effectiveAt = "2026-08-10T09:00:00.000Z";
    const roots = [
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
    ].map((id) => ({
      id,
      user_id: ownerId,
      scheduled_session_id: null,
      workout_name: `Workout ${id[0]}`,
      workout_day_name: null,
      workout_category: "strength",
      started_at: "2026-08-10T08:00:00.000Z",
      completed_at: effectiveAt,
      skipped_at: null,
      cancelled_at: null,
      duration_minutes: 60,
      notes: null,
      status: "completed",
      plan_id: null,
      plan_day_id: null,
      plan_week_id: null,
      plan_session_id: null,
    }));
    const rows = {
      workout_sessions: roots,
      user_workout_sessions: [],
      exercise_logs: [],
      exercise_log_metric_values: [],
      workout_session_prescription_sets: [],
      workout_session_muscle_snapshots: [],
      workout_session_muscle_snapshot_items: [],
    };
    const request: WorkoutHistoryListRequest = {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
      limit: 2,
      statuses: ["completed"],
      sort: "newest",
    };

    const first = await listWorkoutHistory(queryClient(rows).client, ownerId, request, secret);
    const second = await listWorkoutHistory(queryClient(rows).client, ownerId, {
      ...request,
      cursor: first.nextCursor ?? undefined,
    }, secret);

    expect(first.items.map((item) => item.activityId)).toEqual([
      roots[2]!.id,
      roots[1]!.id,
    ]);
    expect(second.items.map((item) => item.activityId)).toEqual([roots[0]!.id]);
    expect(first.summary?.eligibleWorkoutCount).toBe(3);
    expect(second.summary).toBeUndefined();
    expect(new Set([...first.items, ...second.items].map((item) => item.activityId)).size)
      .toBe(3);
  });

  it.each([
    ["100%_ effort", performedId],
    ["قوة", performedId],
    ["Rücken", "66666666-6666-4666-8666-666666666666"],
  ])("searches only the bounded member-facing corpus for %s", async (search, expectedId) => {
    const secondId = "66666666-6666-4666-8666-666666666666";
    const outsiderId = "77777777-7777-4777-8777-777777777777";
    const planId = "88888888-8888-4888-8888-888888888888";
    const session = (id: string, userId: string, name: string, plan: string | null) => ({
      id,
      user_id: userId,
      scheduled_session_id: null,
      workout_name: name,
      workout_day_name: null,
      workout_category: "strength",
      started_at: "2026-08-03T08:00:00.000Z",
      completed_at: "2026-08-03T09:00:00.000Z",
      skipped_at: null,
      cancelled_at: null,
      duration_minutes: 60,
      notes: null,
      status: "completed",
      plan_id: plan,
      plan_day_id: null,
      plan_week_id: null,
      plan_session_id: null,
    });
    const log = (id: string, sessionId: string, name: string) => ({
      id,
      workout_session_id: sessionId,
      plan_exercise_id: null,
      plan_activity_id: null,
      exercise_order: 1,
      exercise_name: name,
      exercise_category: "strength",
      set_number: 1,
      reps: 10,
      weight_kg: 20,
      notes: null,
      completed_at: "2026-08-03T08:30:00.000Z",
    });
    const { client, calls } = queryClient({
      workout_sessions: [
        session(performedId, ownerId, "Push day", planId),
        session(secondId, ownerId, "Rücken Einheit", null),
        session(outsiderId, "99999999-9999-4999-8999-999999999999", "Private outsider", null),
      ],
      user_workout_sessions: [],
      exercise_logs: [
        log("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", performedId, "Bench press"),
        log("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", secondId, "Row"),
      ],
      exercise_log_set_details: [{ workout_session_id: performedId, notes: "100%_ effort" }],
      exercise_log_metric_values: [],
      workout_session_prescription_sets: [],
      workout_session_muscle_snapshots: [],
      workout_session_muscle_snapshot_items: [],
      user_workout_plans: [{ id: planId, name: "خطة قوة" }],
    });
    const result = await listWorkoutHistory(client, ownerId, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
      statuses: ["completed"],
      search,
    }, secret);
    expect(result.items.map((item) => item.canonicalSessionId)).toEqual([expectedId]);
    expect(JSON.stringify(result)).not.toContain("100%_ effort");
    expect(calls).toContainEqual({ table: "workout_sessions", method: "eq", args: ["user_id", ownerId] });
  });
});
