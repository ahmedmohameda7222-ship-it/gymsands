import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";
import type {
  WorkoutHistoryFilterOptions,
  WorkoutHistoryListRequest,
} from "@/types/workout-history";

type FilterOptionRow = {
  option_kind: "workout_type" | "muscle" | "exercise" | "plan";
  option_value: string;
  option_label: string;
  degraded: boolean;
};

function ordered<T extends { label: string }>(values: T[]): T[] {
  return values.sort((left, right) => left.label.localeCompare(right.label));
}

export async function readWorkoutHistoryFilterOptions(
  supabase: SupabaseClient,
  userId: string,
  request: WorkoutHistoryListRequest,
): Promise<WorkoutHistoryFilterOptions> {
  const result = await supabase.rpc("get_workout_history_filter_options_v1", {
    p_user_id: userId,
    p_from: request.from,
    p_to: request.to,
    p_statuses: request.statuses?.length
      ? request.statuses
      : ["completed", "partial"],
    p_search: request.search ?? null,
    p_progress_only: request.progressOnly === true,
  });
  if (result.error) {
    throw new WorkoutHistoryReaderError(
      "history_read_failed",
      "Workout history could not load.",
      503,
    );
  }
  const rows = (result.data ?? []) as unknown as FilterOptionRow[];
  const byKind = <K extends FilterOptionRow["option_kind"]>(kind: K) =>
    rows.filter((row) => row.option_kind === kind);
  return {
    workoutTypes: ordered(byKind("workout_type").map((row) => ({
      value: row.option_value,
      label: row.option_label,
    }))),
    muscles: ordered(byKind("muscle").map((row) => ({
      value: row.option_value,
      label: row.option_label,
    }))),
    exercises: ordered(byKind("exercise").map((row) => ({
      value: row.option_value,
      label: row.option_label,
      degraded: row.degraded || undefined,
    }))),
    plans: ordered(byKind("plan").map((row) => ({
      value: row.option_value,
      label: row.option_label,
    }))),
  };
}
