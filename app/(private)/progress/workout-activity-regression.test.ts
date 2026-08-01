import { describe, expect, it } from "vitest";

import { countCanonicalWorkoutActivity } from "@/lib/workouts/history/contracts";
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";

describe("Progress canonical workout activity regression", () => {
  it("counts a linked performed and scheduled Production shape once", () => {
    const owner = "20000000-0000-4000-8000-000000000001";
    const scheduledId = "30000000-0000-4000-8000-000000000001";
    const activities = resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [{
        session: {
          id: "10000000-0000-4000-8000-000000000001",
          user_id: owner,
          scheduled_session_id: scheduledId,
          workout_name: "Strength",
          started_at: "2026-07-01T08:00:00.000Z",
          completed_at: "2026-07-01T09:00:00.000Z",
          duration_minutes: 60,
          notes: null,
          status: "completed",
        },
        metadata: {
          completedSetCount: 3,
          structuredPerformedMetricCount: 0,
          actualPerformedSnapshotCount: 0,
          plannedSetCount: 3,
        },
      }],
      scheduledTerminal: [{
        id: scheduledId,
        user_id: owner,
        user_workout_plan_id: "40000000-0000-4000-8000-000000000001",
        plan_day_id: null,
        scheduled_date: "2026-07-01",
        day_title: "Strength",
        status: "completed",
        started_at: null,
        completed_at: "2026-07-01T09:00:00.000Z",
        skipped_at: null,
        duration_minutes: 60,
        notes: null,
      }],
    });
    expect(countCanonicalWorkoutActivity(activities)).toEqual({
      completed: 1,
      partial: 0,
      cancelled: 0,
      skipped: 0,
      total: 1,
    });
  });
});
