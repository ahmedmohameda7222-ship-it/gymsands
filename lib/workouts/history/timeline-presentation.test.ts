import { describe, expect, it } from "vitest";

import { presentWorkoutHistoryTimeline } from "@/lib/workouts/history/timeline-presentation";

describe("Workout History human timeline presentation", () => {
  it("allows only approved durable events and exposes no raw payload or technical identities", () => {
    const rows = [
      { id: "1", event_type: "session_started", occurred_at: "2026-08-01T08:00:00.000Z", exercise_log_id: null, snapshot_item_id: null, payload: { deviceId: "hidden" } },
      { id: "2", event_type: "session_paused", occurred_at: "2026-08-01T08:05:00.000Z", exercise_log_id: null, snapshot_item_id: null, payload: { command: "hidden" } },
      { id: "3", event_type: "set_edited", occurred_at: "2026-08-01T08:15:00.000Z", exercise_log_id: "log-1", snapshot_item_id: null, payload: { revision: 9 } },
      { id: "4", event_type: "exercise_replaced", occurred_at: "2026-08-01T08:20:00.000Z", exercise_log_id: null, snapshot_item_id: "item-1", payload: { provider: "hidden" } },
    ];
    const result = presentWorkoutHistoryTimeline(
      rows,
      new Map([["log-1", "Bench press"]]),
      new Map([["item-1", "Dumbbell press"]]),
    );

    expect(result).toEqual([
      { id: "1", type: "workout_started", occurredAt: "2026-08-01T08:00:00.000Z", exerciseName: null },
      { id: "3", type: "set_corrected", occurredAt: "2026-08-01T08:15:00.000Z", exerciseName: "Bench press" },
      { id: "4", type: "exercise_replaced", occurredAt: "2026-08-01T08:20:00.000Z", exerciseName: "Dumbbell press" },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/payload|device|command|revision|provider/iu);
  });
});
