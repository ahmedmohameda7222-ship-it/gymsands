import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CURRENT_WORKOUT_PERFORMANCE_METRIC_DEFINITIONS,
  getWorkoutSessionPerformance,
  normalizeWorkoutPerformanceMetricInput,
  workoutPerformanceMetricInputToSql
} from "./workout-performance";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

function queryClient(rows: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "limit"]) {
    query[method] = () => query;
  }
  query.then = (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
  return { from: () => query } as unknown as SupabaseClient;
}

describe("AW-3A workout performance domain", () => {
  it("keeps the exact approved seven-definition registry", () => {
    expect(CURRENT_WORKOUT_PERFORMANCE_METRIC_DEFINITIONS).toEqual([
      expect.objectContaining({ metricKey: "repetitions", metricVersion: 1, canonicalUnit: "count", sortOrder: 10 }),
      expect.objectContaining({ metricKey: "external_load_kg", metricVersion: 1, canonicalUnit: "kg", sortOrder: 20 }),
      expect.objectContaining({ metricKey: "bodyweight_kg", metricVersion: 1, canonicalUnit: "kg", supportsSide: false }),
      expect.objectContaining({ metricKey: "assistance_load_kg", metricVersion: 1, canonicalUnit: "kg" }),
      expect.objectContaining({ metricKey: "duration_seconds", metricVersion: 1, canonicalUnit: "seconds" }),
      expect.objectContaining({ metricKey: "distance_meters", metricVersion: 1, canonicalUnit: "meters" }),
      expect.objectContaining({ metricKey: "rounds", metricVersion: 1, canonicalUnit: "count", sortOrder: 70 })
    ]);
  });

  it("enforces range, integer, side, and source/provider constraints", () => {
    expect(() => normalizeWorkoutPerformanceMetricInput({ metricKey: "repetitions", value: 1.5 })).toThrow(/integer/i);
    expect(() => normalizeWorkoutPerformanceMetricInput({ metricKey: "rounds", value: -1 })).toThrow(/range/i);
    expect(() => normalizeWorkoutPerformanceMetricInput({ metricKey: "bodyweight_kg", value: 80, side: "left" })).toThrow(/side/i);
    expect(() => normalizeWorkoutPerformanceMetricInput({ metricKey: "distance_meters", value: 100, source: "device" })).toThrow(/provider/i);
    expect(() => normalizeWorkoutPerformanceMetricInput({
      metricKey: "distance_meters",
      value: 100,
      source: "device",
      sourceProvider: "unsafe provider"
    })).toThrow(/provider/i);
  });

  it("maps camelCase inputs to the bounded SQL payload", () => {
    expect(workoutPerformanceMetricInputToSql({
      metricKey: "duration_seconds",
      metricVersion: 1,
      value: 60,
      side: "none",
      source: "chatgpt",
      sourceProvider: "openai",
      sourceVersion: "v1",
      capturedAt: "2026-07-22T10:00:00.000Z"
    })).toEqual({
      metric_key: "duration_seconds",
      metric_version: 1,
      value: 60,
      side: "none",
      source: "chatgpt",
      source_provider: "openai",
      source_version: "v1",
      captured_at: "2026-07-22T10:00:00.000Z"
    });
  });

  it("maps and deterministically orders owner-scoped session metrics", async () => {
    const common = {
      workout_session_id: sessionId,
      user_id: userId,
      source: "manual",
      source_provider: null,
      source_version: null,
      captured_at: "2026-07-22T10:00:00.000Z",
      created_at: "2026-07-22T10:00:00.000Z",
      updated_at: "2026-07-22T10:00:00.000Z"
    };
    const result = await getWorkoutSessionPerformance(queryClient([
      {
        ...common,
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        exercise_log_id: "44444444-4444-4444-8444-444444444444",
        metric_key: "distance_meters",
        metric_version: 1,
        side: "none",
        value: "100",
        workout_performance_metric_definitions: { canonical_unit: "meters", sort_order: 60 },
        exercise_logs: { exercise_order: 2, exercise_name: "Run", set_number: 1 }
      },
      {
        ...common,
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        exercise_log_id: "33333333-3333-4333-8333-333333333333",
        metric_key: "repetitions",
        metric_version: 1,
        side: "left",
        value: "8",
        workout_performance_metric_definitions: { canonical_unit: "count", sort_order: 10 },
        exercise_logs: { exercise_order: 1, exercise_name: "Split squat", set_number: 1 }
      },
      {
        ...common,
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        exercise_log_id: "33333333-3333-4333-8333-333333333333",
        metric_key: "repetitions",
        metric_version: 1,
        side: "right",
        value: "7",
        workout_performance_metric_definitions: { canonical_unit: "count", sort_order: 10 },
        exercise_logs: { exercise_order: 1, exercise_name: "Split squat", set_number: 1 }
      }
    ]), userId, sessionId);

    expect(result.sets.map((set) => set.exerciseName)).toEqual(["Split squat", "Run"]);
    expect(result.sets[0]?.metrics.map((metric) => metric.side)).toEqual(["left", "right"]);
  });

  it("rejects invalid UUIDs with safe errors before querying", async () => {
    await expect(getWorkoutSessionPerformance(queryClient([]), "bad", sessionId)).rejects.toThrow("User is invalid.");
    await expect(getWorkoutSessionPerformance(queryClient([]), userId, "bad")).rejects.toThrow("Workout session is invalid.");
  });
});
