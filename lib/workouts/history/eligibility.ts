import type {
  PerformedWorkoutHistoryCandidate,
  ScheduledWorkoutHistoryRow,
  WorkoutHistoryEligibilityOptions,
} from "@/lib/workouts/history/contracts";
import type { WorkoutHistoryLifecycle } from "@/types/workout-history";

const DEFAULT_VISIBLE_STATUSES = new Set<WorkoutHistoryLifecycle>([
  "completed",
  "partial",
  "skipped",
]);

function nonNegativeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function hasMeaningfulWorkoutPerformance(
  metadata: PerformedWorkoutHistoryCandidate["metadata"],
): boolean {
  return (
    nonNegativeCount(metadata.completedSetCount) > 0 ||
    nonNegativeCount(metadata.structuredPerformedMetricCount) > 0 ||
    nonNegativeCount(metadata.actualPerformedSnapshotCount) > 0
  );
}

export function derivePerformedWorkoutLifecycle(
  candidate: PerformedWorkoutHistoryCandidate,
): WorkoutHistoryLifecycle | null {
  const { session, metadata } = candidate;
  if (session.status === "started") return null;
  if (session.status === "skipped") return "skipped";
  if (session.status === "cancelled") return "cancelled";

  const plannedSetCount =
    metadata.plannedSetCount === null
      ? null
      : nonNegativeCount(metadata.plannedSetCount);
  const completedSetCount = nonNegativeCount(metadata.completedSetCount);
  if (
    plannedSetCount !== null &&
    plannedSetCount > 0 &&
    completedSetCount < plannedSetCount
  ) {
    return "partial";
  }
  return "completed";
}

export function deriveScheduledWorkoutLifecycle(
  session: ScheduledWorkoutHistoryRow,
): WorkoutHistoryLifecycle | null {
  if (session.status === "completed") return "completed";
  if (session.status === "skipped") return "skipped";
  return null;
}

function requestedStatuses(
  options?: WorkoutHistoryEligibilityOptions,
): Set<WorkoutHistoryLifecycle> {
  if (options?.statuses?.length) return new Set(options.statuses);
  if (options?.includeMeaningfulCancelled) {
    return new Set([...DEFAULT_VISIBLE_STATUSES, "cancelled"]);
  }
  return DEFAULT_VISIBLE_STATUSES;
}

export function isPerformedWorkoutHistoryEligible(
  candidate: PerformedWorkoutHistoryCandidate,
  lifecycle: WorkoutHistoryLifecycle,
  options?: WorkoutHistoryEligibilityOptions,
): boolean {
  if (candidate.session.deleted_at && !options?.includeDeleted) return false;
  if (!requestedStatuses(options).has(lifecycle)) return false;
  if (lifecycle === "cancelled") {
    return hasMeaningfulWorkoutPerformance(candidate.metadata);
  }
  return true;
}

export function isScheduledWorkoutHistoryEligible(
  lifecycle: WorkoutHistoryLifecycle,
  options?: WorkoutHistoryEligibilityOptions,
): boolean {
  return requestedStatuses(options).has(lifecycle);
}
