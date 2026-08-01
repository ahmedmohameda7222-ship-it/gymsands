import { describe, expect, it } from "vitest";

import type { PerformedWorkoutHistoryCandidate } from "@/lib/workouts/history/contracts";
import {
  derivePerformedWorkoutLifecycle,
  hasMeaningfulWorkoutPerformance,
} from "@/lib/workouts/history/eligibility";

function candidate(
  status: PerformedWorkoutHistoryCandidate["session"]["status"],
  metadata: Partial<PerformedWorkoutHistoryCandidate["metadata"]> = {},
): PerformedWorkoutHistoryCandidate {
  return {
    session: {
      id: "10000000-0000-4000-8000-000000000001",
      user_id: "20000000-0000-4000-8000-000000000001",
      workout_name: "Strength",
      started_at: "2026-07-01T08:00:00.000Z",
      completed_at: status === "completed" ? "2026-07-01T09:00:00.000Z" : null,
      duration_minutes: null,
      notes: null,
      status,
    },
    metadata: {
      completedSetCount: 0,
      structuredPerformedMetricCount: 0,
      actualPerformedSnapshotCount: 0,
      plannedSetCount: null,
      ...metadata,
    },
  };
}

describe("Workout History eligibility", () => {
  it("never treats a started root as terminal history", () => {
    expect(derivePerformedWorkoutLifecycle(candidate("started"))).toBeNull();
  });

  it("derives partial only from trusted planned and performed set counts", () => {
    expect(
      derivePerformedWorkoutLifecycle(
        candidate("completed", { plannedSetCount: 4, completedSetCount: 2 }),
      ),
    ).toBe("partial");
    expect(
      derivePerformedWorkoutLifecycle(
        candidate("completed", { plannedSetCount: null, completedSetCount: 0 }),
      ),
    ).toBe("completed");
  });

  it("does not use planned sets as proof of performed work", () => {
    expect(
      hasMeaningfulWorkoutPerformance(
        candidate("completed", { plannedSetCount: 4 }).metadata,
      ),
    ).toBe(false);
  });

  it("recognizes committed sets, structured metrics, or actual snapshots", () => {
    expect(
      hasMeaningfulWorkoutPerformance(
        candidate("cancelled", { completedSetCount: 1 }).metadata,
      ),
    ).toBe(true);
    expect(
      hasMeaningfulWorkoutPerformance(
        candidate("cancelled", { structuredPerformedMetricCount: 1 }).metadata,
      ),
    ).toBe(true);
    expect(
      hasMeaningfulWorkoutPerformance(
        candidate("cancelled", { actualPerformedSnapshotCount: 1 }).metadata,
      ),
    ).toBe(true);
  });
});
