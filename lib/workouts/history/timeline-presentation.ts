import type { WorkoutHistoryTimelineEntry } from "@/types/workout-history";

export type WorkoutHistoryTimelineSourceRow = {
  id: string;
  event_type: string;
  occurred_at: string;
  exercise_log_id: string | null;
  snapshot_item_id: string | null;
};

const visibleTypes = {
  session_started: "workout_started",
  set_completed: "set_completed",
  set_edited: "set_corrected",
  exercise_replaced: "exercise_replaced",
  session_completed: "workout_completed",
} as const;

export function presentWorkoutHistoryTimeline(
  rows: readonly WorkoutHistoryTimelineSourceRow[],
  exerciseNameByLogId: ReadonlyMap<string, string>,
  exerciseNameBySnapshotItemId: ReadonlyMap<string, string>,
): WorkoutHistoryTimelineEntry[] {
  return rows.flatMap((row) => {
    const type = visibleTypes[row.event_type as keyof typeof visibleTypes];
    if (!type) return [];
    return [{
      id: row.id,
      type,
      occurredAt: row.occurred_at,
      exerciseName: row.exercise_log_id
        ? exerciseNameByLogId.get(row.exercise_log_id) ?? null
        : row.snapshot_item_id
          ? exerciseNameBySnapshotItemId.get(row.snapshot_item_id) ?? null
          : null,
    }];
  });
}
