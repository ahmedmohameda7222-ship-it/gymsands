import type { CanonicalWorkoutActivity, WorkoutHistorySessionSummary } from "@/types/workout-history";

export type WorkoutHistoryPresentationMetadata = {
  exerciseCount: number | null;
  completedSetCount: number | null;
  reliableVolume: number | null;
  verifiedRecordCount?: number | null;
  exerciseIds?: string[];
  exerciseNames?: string[];
  muscleIds?: string[];
};

export function presentWorkoutHistorySession(
  activity: CanonicalWorkoutActivity,
  metadata?: WorkoutHistoryPresentationMetadata,
): WorkoutHistorySessionSummary {
  return {
    ...activity,
    notes: null,
    exerciseCount: metadata?.exerciseCount ?? null,
    completedSetCount: metadata?.completedSetCount ?? null,
    reliableVolume: metadata?.reliableVolume ?? null,
    verifiedRecordCount: metadata?.verifiedRecordCount ?? null,
    exerciseIds: [...(metadata?.exerciseIds ?? [])],
    exerciseNames: [...(metadata?.exerciseNames ?? [])],
    muscleIds: [...(metadata?.muscleIds ?? [])],
    insight: null,
  };
}
