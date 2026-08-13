import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getScheduledWorkoutHistoryDetail,
  getWorkoutHistorySessionDetail,
} from "@/services/workouts/history/server-reader";

const owner = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000001";
const snapshotId = "30000000-0000-4000-8000-000000000001";
const itemId = "40000000-0000-4000-8000-000000000001";
const logId = "50000000-0000-4000-8000-000000000001";

function detailClient(rows: Record<string, unknown[]>) {
  const calls: string[] = [];
  const client = {
    rpc: vi.fn(async (name: string) => name === "get_workout_history_pr_projection_inputs_v1"
      ? { data: rows.personal_records ?? [], error: null }
      : { data: null, error: { message: `Unexpected RPC: ${name}` } }),
    from: vi.fn((table: string) => {
      calls.push(table);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "in", "order"] as const) builder[method] = vi.fn(() => builder);
      builder.range = vi.fn(async () => ({ data: rows[table] ?? [], error: null }));
      builder.maybeSingle = vi.fn(async () => ({ data: rows[table]?.[0] ?? null, error: null }));
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject);
      return builder;
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function performedRows(options: {
  status?: "completed" | "cancelled";
  plannedSets?: number;
  snapshotVersion?: string;
  direct?: boolean;
  replaced?: boolean;
  noVolume?: boolean;
} = {}) {
  const plannedSets = options.plannedSets ?? 1;
  return {
    workout_sessions: [{
      id: sessionId,
      user_id: owner,
      scheduled_session_id: null,
      workout_name: "Immutable strength",
      workout_day_name: null,
      workout_category: "strength",
      started_at: "2026-08-01T08:00:00.000Z",
      completed_at: options.status === "cancelled" ? null : "2026-08-01T09:00:00.000Z",
      skipped_at: null,
      cancelled_at: options.status === "cancelled" ? "2026-08-01T08:30:00.000Z" : null,
      duration_minutes: 60,
      notes: "Saved session note",
      status: options.status ?? "completed",
      plan_id: "90000000-0000-4000-8000-000000000001",
      plan_day_id: null,
      plan_week_id: null,
      plan_session_id: null,
    }],
    exercise_logs: [{
      id: logId,
      workout_session_id: sessionId,
      plan_exercise_id: options.direct ? null : "60000000-0000-4000-8000-000000000001",
      plan_activity_id: null,
      exercise_order: 1,
      exercise_name: options.replaced ? "Dumbbell press" : "Bench press",
      exercise_category: "strength",
      set_number: 1,
      reps: options.noVolume ? null : 8,
      weight_kg: options.noVolume ? null : 80,
      notes: null,
      completed_at: "2026-08-01T08:15:00.000Z",
      set_type: "working",
    }],
    workout_session_muscle_snapshots: [{
      id: snapshotId,
      workout_session_id: sessionId,
      snapshot_schema_version: options.snapshotVersion ?? "workout_session_muscle_snapshot_v1",
      frozen_at: "2026-08-01T08:00:00.000Z",
    }],
    workout_session_muscle_snapshot_items: [{
      id: itemId,
      snapshot_id: snapshotId,
      source_plan_exercise_id: options.direct ? null : "60000000-0000-4000-8000-000000000001",
      source_plan_activity_id: null,
      item_order: 1,
      activity_name_snapshot: "Bench press",
      actual_name_snapshot: options.replaced ? "Dumbbell press" : null,
      state: options.replaced ? "replaced" : "completed",
      performed_total_sets: 1,
    }],
    workout_session_prescription_sets: Array.from({ length: plannedSets }, (_, index) => ({
      id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      snapshot_item_id: itemId,
      set_order: index + 1,
      performed_order_hint: index + 1,
      set_type: "working",
      target_mode: "range",
      side_mode: "bilateral",
      rest_seconds: 90,
      tempo_target: null,
    })),
    workout_session_prescription_metric_targets: [{
      prescription_set_id: "70000000-0000-4000-8000-000000000001",
      metric_key: "repetitions",
      side: "none",
      target_mode: "range",
      target_value: null,
      minimum_value: 8,
      maximum_value: 10,
    }],
    exercise_log_metric_values: options.noVolume ? [{ exercise_log_id: logId, metric_key: "duration_seconds", side: "none", value: 60 }] : [],
    exercise_log_set_details: [{ exercise_log_id: logId, set_type: "working", rpe: 8, rir: 2, notes: "Controlled" }],
    exercise_log_set_segments: [],
    exercise_log_set_segment_metric_values: [],
    workout_session_timeline_events: [{
      id: "80000000-0000-4000-8000-000000000001",
      event_type: "set_completed",
      occurred_at: "2026-08-01T08:15:00.000Z",
      exercise_log_id: logId,
      snapshot_item_id: itemId,
      sequence_number: 1,
      payload: { deviceId: "must-never-return" },
    }],
  };
}

describe("Workout History canonical detail reader", () => {
  it("returns a full frozen session with matched planned and actual set details", async () => {
    const { client } = detailClient(performedRows());
    const result = await getWorkoutHistorySessionDetail(client, owner, sessionId);

    expect(result.activity.lifecycle).toBe("completed");
    expect(result.exercises[0]).toMatchObject({ name: "Bench press", plannedSetCount: 1 });
    expect(result.exercises[0]?.performedSets[0]).toMatchObject({ matchState: "matched", rpe: 8, rir: 2 });
    expect(JSON.stringify(result)).not.toContain("must-never-return");
    expect(JSON.stringify(result)).not.toContain("command_id");
  });

  it("derives a partial session and preserves an unmatched prescription as missing", async () => {
    const { client } = detailClient(performedRows({ plannedSets: 2 }));
    const result = await getWorkoutHistorySessionDetail(client, owner, sessionId);
    expect(result.activity.lifecycle).toBe("partial");
    expect(result.exercises[0]?.missingPlannedSets).toHaveLength(1);
    expect(result.exercises[0]?.performedSets).toHaveLength(1);
  });

  it("keeps meaningful cancelled performance and no-volume modalities truthful", async () => {
    const cancelled = await getWorkoutHistorySessionDetail(detailClient(performedRows({ status: "cancelled" })).client, owner, sessionId);
    const noVolume = await getWorkoutHistorySessionDetail(detailClient(performedRows({ noVolume: true })).client, owner, sessionId);
    expect(cancelled.activity.lifecycle).toBe("cancelled");
    expect(cancelled.exercises[0]?.performedSets).toHaveLength(1);
    expect(noVolume.summary.reliableVolume).toBeNull();
    expect(noVolume.exercises[0]?.performedSets[0]?.metrics).toMatchObject([{ metricKey: "duration_seconds", value: 60 }]);
  });

  it("supports V1 and V2 snapshot headers without reading mutable plan tables", async () => {
    const v1 = detailClient(performedRows({ snapshotVersion: "workout_session_muscle_snapshot_v1" }));
    const v2 = detailClient(performedRows({ snapshotVersion: "workout_session_muscle_snapshot_v2" }));
    expect((await getWorkoutHistorySessionDetail(v1.client, owner, sessionId)).snapshot?.schemaVersion).toContain("v1");
    expect((await getWorkoutHistorySessionDetail(v2.client, owner, sessionId)).snapshot?.schemaVersion).toContain("v2");
    expect([...v1.calls, ...v2.calls]).not.toContain("user_workout_plans");
    expect([...v1.calls, ...v2.calls]).not.toContain("user_workout_plan_exercises");
  });

  it("matches direct sessions by immutable item order and exposes replacements from the snapshot", async () => {
    const direct = await getWorkoutHistorySessionDetail(detailClient(performedRows({ direct: true })).client, owner, sessionId);
    const replaced = await getWorkoutHistorySessionDetail(detailClient(performedRows({ replaced: true })).client, owner, sessionId);
    expect(direct.exercises[0]?.performedSets[0]?.matchState).toBe("matched");
    expect(replaced.exercises[0]).toMatchObject({ name: "Dumbbell press", plannedName: "Bench press", state: "replaced" });
  });

  it("does not guess a prescription when immutable identity is absent", async () => {
    const rows = performedRows({ direct: true });
    rows.exercise_logs[0]!.exercise_order = 9;
    const result = await getWorkoutHistorySessionDetail(detailClient(rows).client, owner, sessionId);
    const fallbackExercise = result.exercises.find((exercise) => exercise.snapshotItemId === null);
    expect(fallbackExercise?.performedSets[0]?.matchState).toBe("unplanned");
    expect(result.exercises.find((exercise) => exercise.snapshotItemId === itemId)?.missingPlannedSets).toHaveLength(1);
  });

  it("returns a deliberately reduced scheduled fallback with compatibility labels only", async () => {
    const rows = {
      user_workout_sessions: [{
        id: sessionId, user_id: owner, user_workout_plan_id: "90000000-0000-4000-8000-000000000001",
        plan_day_id: null, plan_week_id: null, plan_session_id: null, scheduled_date: "2026-08-01",
        day_title: "Legacy day", status: "completed", started_at: null,
        completed_at: "2026-08-01T09:00:00.000Z", skipped_at: null, duration_minutes: 45, notes: "Legacy note",
      }],
      user_exercise_logs: [{ exercise_order: 1, exercise_name: "Legacy press", reps: 10, weight_kg: 80 }],
    };
    const result = await getScheduledWorkoutHistoryDetail(detailClient(rows).client, owner, sessionId);
    expect(result.activity.sourceKind).toBe("scheduled_fallback");
    expect(result.exercises).toMatchObject([{ name: "Legacy press", performedSets: [] }]);
    expect(result.summary).toMatchObject({ completedSetCount: null, reliableVolume: null, verifiedRecordCount: null });
    expect(result.timeline).toEqual([]);
  });

  it("makes unauthorized and nonexistent performed IDs indistinguishable", async () => {
    const first = getWorkoutHistorySessionDetail(detailClient({ workout_sessions: [] }).client, owner, sessionId);
    const second = getWorkoutHistorySessionDetail(detailClient({ workout_sessions: [] }).client, owner, "20000000-0000-4000-8000-000000000099");
    for (const request of [first, second]) {
      await expect(request).rejects.toMatchObject({ code: "history_not_found", status: 404 });
    }
  });
});
