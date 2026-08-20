import type { CanonicalPersonalRecordEvent } from "@/lib/personal-records/contracts";
import type { WorkoutHistorySessionSummary } from "@/types/workout-history";

export const STRENGTH_DETAIL_RECORD_KEYS = [
  "highest_load",
  "estimated_one_rep_max",
  "same_load_max_repetitions",
  "exercise_session_volume",
] as const;

export type StrengthDetailRecordKey = typeof STRENGTH_DETAIL_RECORD_KEYS[number];

export type ExercisePerformanceBest = {
  key: StrengthDetailRecordKey;
  event: CanonicalPersonalRecordEvent;
};

export type ExercisePerformanceSession = Pick<
  WorkoutHistorySessionSummary,
  "activityId" | "canonicalSessionId" | "title" | "effectiveAt" | "completedSetCount" | "reliableVolume" | "resultKind" | "resultFacts"
>;

export type ExercisePerformanceModel = {
  performed: boolean;
  lastPerformedAt: string | null;
  recentWorkoutId: string | null;
  recentSessions: ExercisePerformanceSession[];
  bests: ExercisePerformanceBest[];
};

export function performanceBestsFromProjection(input: {
  highestLoad: CanonicalPersonalRecordEvent | null;
  estimatedOneRepMax: CanonicalPersonalRecordEvent | null;
  sameLoadMaxRepetitions?: CanonicalPersonalRecordEvent | null;
  exerciseSessionVolume?: CanonicalPersonalRecordEvent | null;
}): ExercisePerformanceBest[] {
  return [
    ["highest_load", input.highestLoad],
    ["estimated_one_rep_max", input.estimatedOneRepMax],
    ["same_load_max_repetitions", input.sameLoadMaxRepetitions ?? null],
    ["exercise_session_volume", input.exerciseSessionVolume ?? null],
  ].flatMap(([key, event]) => event ? [{ key: key as StrengthDetailRecordKey, event }] : []);
}
