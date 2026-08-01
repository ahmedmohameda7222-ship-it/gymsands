import type {
  WorkoutHistoryListSummary,
  WorkoutHistorySessionSummary,
} from "@/types/workout-history";

function nullableSum(values: Array<number | null>): number | null {
  const reliable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return reliable.length ? reliable.reduce((sum, value) => sum + value, 0) : null;
}

export function summarizeWorkoutHistory(
  items: readonly WorkoutHistorySessionSummary[],
): WorkoutHistoryListSummary {
  return {
    eligibleWorkoutCount: items.length,
    trustedDurationMinutes: nullableSum(items.map((item) => item.durationMinutes)),
    completedSetCount: nullableSum(items.map((item) => item.completedSetCount)),
    reliableVolume: nullableSum(items.map((item) => item.reliableVolume)),
    verifiedRecordCount: nullableSum(items.map((item) => item.verifiedRecordCount)),
  };
}
