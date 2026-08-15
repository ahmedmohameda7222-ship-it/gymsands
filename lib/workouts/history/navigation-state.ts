import {
  customWorkoutHistoryPeriodRange,
  workoutHistoryTimeZoneParts,
  workoutHistoryPeriodRange,
  type WorkoutHistoryDateRange,
  type WorkoutHistoryPeriodMode,
} from "@/lib/workouts/history/date-range";
import type { WorkoutHistoryLifecycle, WorkoutHistorySort } from "@/types/workout-history";

const PERIODS = new Set<WorkoutHistoryPeriodMode>(["week", "month", "three-months", "custom"]);
const STATUSES = new Set<WorkoutHistoryLifecycle>(["completed", "partial", "cancelled", "skipped"]);
const SORTS = new Set<WorkoutHistorySort>(["newest", "oldest", "longest_duration"]);

export type WorkoutHistoryNavigationState = {
  period: WorkoutHistoryPeriodMode;
  range: WorkoutHistoryDateRange;
  search: string;
  workoutType: string;
  muscle: string;
  exercise: string;
  plan: string;
  statuses: WorkoutHistoryLifecycle[];
  progressOnly: boolean;
  sort: WorkoutHistorySort;
};

function normalized(value: string | null): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function localDate(iso: string, timezone: string): string {
  const value = workoutHistoryTimeZoneParts(new Date(iso), timezone);
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function parseWorkoutHistoryNavigationState(
  params: URLSearchParams,
  now: Date,
  timezone: string,
): WorkoutHistoryNavigationState {
  const requestedPeriod = params.get("period") as WorkoutHistoryPeriodMode | null;
  const period = requestedPeriod && PERIODS.has(requestedPeriod) ? requestedPeriod : "month";
  let range = workoutHistoryPeriodRange(period === "custom" ? "month" : period, now, timezone);
  if (params.has("from") || params.has("to")) {
    try {
      range = customWorkoutHistoryPeriodRange(params.get("from") ?? "", params.get("to") ?? "", timezone);
    } catch {
      // Invalid links fail closed to the safe current-month default.
    }
  }
  const statuses = (params.get("status") ?? "completed,partial")
    .split(",")
    .filter((value): value is WorkoutHistoryLifecycle => STATUSES.has(value as WorkoutHistoryLifecycle));
  const requestedSort = params.get("sort") as WorkoutHistorySort | null;
  return {
    period,
    range,
    search: normalized(params.get("q")),
    workoutType: normalized(params.get("type")),
    muscle: normalized(params.get("muscle")),
    exercise: normalized(params.get("exercise")),
    plan: normalized(params.get("plan")),
    statuses: statuses.length ? [...new Set(statuses)] : ["completed", "partial"],
    progressOnly: params.get("progress") === "true",
    sort: requestedSort && SORTS.has(requestedSort) ? requestedSort : "newest",
  };
}

export function workoutHistoryNavigationSearchParams(state: WorkoutHistoryNavigationState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.period !== "month") params.set("period", state.period);
  params.set("from", localDate(state.range.from, state.range.timezone));
  params.set("to", localDate(new Date(Date.parse(state.range.to) - 1).toISOString(), state.range.timezone));
  if (state.search) params.set("q", state.search);
  if (state.workoutType) params.set("type", state.workoutType);
  if (state.muscle) params.set("muscle", state.muscle);
  if (state.exercise) params.set("exercise", state.exercise);
  if (state.plan) params.set("plan", state.plan);
  if (state.statuses.join(",") !== "completed,partial") params.set("status", state.statuses.join(","));
  if (state.progressOnly) params.set("progress", "true");
  if (state.sort !== "newest") params.set("sort", state.sort);
  return params;
}
