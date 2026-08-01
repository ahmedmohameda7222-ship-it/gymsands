import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { readCanonicalWorkoutActivity } from "@/services/workouts/history/server-reader";

const owner = "20000000-0000-4000-8000-000000000001";

function queryClient(rows: Record<string, unknown[]>, failures: string[] = []) {
  const calls: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      calls.push(table);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit"] as const) {
        builder[method] = vi.fn(() => builder);
      }
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(
        failures.includes(table)
          ? { data: null, error: { message: `${table} failed` } }
          : { data: rows[table] ?? [], error: null },
      ).then(resolve, reject);
      return builder;
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const performedRoot = {
  id: "10000000-0000-4000-8000-000000000001",
  user_id: owner,
  scheduled_session_id: "30000000-0000-4000-8000-000000000001",
  workout_name: "Strength",
  workout_day_name: null,
  workout_category: "strength",
  started_at: "2026-07-01T08:00:00.000Z",
  completed_at: "2026-07-01T09:00:00.000Z",
  skipped_at: null,
  cancelled_at: null,
  duration_minutes: null,
  notes: null,
  status: "completed",
  plan_id: null,
  plan_day_id: null,
  plan_week_id: null,
  plan_session_id: null,
};

const scheduledRoot = {
  id: "30000000-0000-4000-8000-000000000001",
  user_id: owner,
  user_workout_plan_id: "40000000-0000-4000-8000-000000000001",
  plan_day_id: null,
  plan_week_id: null,
  plan_session_id: null,
  scheduled_date: "2026-07-01",
  day_title: "Strength",
  status: "completed",
  started_at: null,
  completed_at: "2026-07-01T09:00:00.000Z",
  skipped_at: null,
  duration_minutes: null,
  notes: null,
};

describe("Workout History server reader", () => {
  it("reads compact metadata in batches and resolves linked duplicates", async () => {
    const { client, calls } = queryClient({
      workout_sessions: [performedRoot],
      user_workout_sessions: [scheduledRoot],
      exercise_logs: [{ id: "50000000-0000-4000-8000-000000000001", workout_session_id: performedRoot.id, completed_at: performedRoot.completed_at }],
      exercise_log_metric_values: [],
      workout_session_prescription_sets: [],
    });
    const result = await readCanonicalWorkoutActivity({ supabase: client, userId: owner });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({ sourceKind: "performed", durationMinutes: null, hasPerformedSets: true });
    expect(calls.filter((table) => table === "exercise_logs")).toHaveLength(1);
    expect(calls).not.toContain("user_exercise_logs");
  });

  it("marks canonical failure instead of presenting fallback as complete history", async () => {
    const { client } = queryClient({ user_workout_sessions: [scheduledRoot] }, ["workout_sessions"]);
    const result = await readCanonicalWorkoutActivity({ supabase: client, userId: owner });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].sourceKind).toBe("scheduled_fallback");
    expect(result.sources.performed.state).toBe("failed");
  });

  it("keeps canonical performed history when scheduled fallback fails", async () => {
    const { client } = queryClient({
      workout_sessions: [performedRoot],
      exercise_logs: [],
      exercise_log_metric_values: [],
      workout_session_prescription_sets: [],
    }, ["user_workout_sessions"]);
    const result = await readCanonicalWorkoutActivity({ supabase: client, userId: owner });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].sourceKind).toBe("performed");
    expect(result.sources.scheduledFallback.state).toBe("failed");
  });
});
