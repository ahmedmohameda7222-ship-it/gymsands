import type {
  CanonicalWorkoutActivity,
  WorkoutHistoryActivityResultKind,
  WorkoutHistoryMetricValue,
  WorkoutHistorySessionSummary,
} from "@/types/workout-history";

export type WorkoutHistoryPresentationMetadata = {
  exerciseCount: number | null;
  completedSetCount: number | null;
  reliableVolume: number | null;
  verifiedRecordCount?: number | null;
  exerciseIds?: string[];
  exerciseNames?: string[];
  muscleIds?: string[];
  resultKind?: WorkoutHistoryActivityResultKind;
  resultFacts?: WorkoutHistoryMetricValue[];
};

export function presentWorkoutHistorySession(
  activity: CanonicalWorkoutActivity,
  metadata?: WorkoutHistoryPresentationMetadata,
): WorkoutHistorySessionSummary {
  const resultKind = metadata?.resultKind ?? "limited";
  const performance = activity.lifecycle === "completed" || activity.lifecycle === "partial";
  const strength = resultKind === "strength_sets";
  const semantic = resultKind === "semantic_metrics";
  return {
    ...activity,
    capabilities: {
      ...activity.capabilities,
      showPerformedSets: strength && activity.capabilities.showPerformedSets,
      showPlannedVsActual: strength && activity.capabilities.showPlannedVsActual,
      showMuscleAnalysis: strength && performance,
      calculatePerformanceMetrics: performance && (strength || semantic),
      calculateVerifiedRecords: performance && (strength || semantic),
      repeatWorkout: strength && activity.capabilities.repeatWorkout,
      correctSession: strength && activity.capabilities.correctSession,
      downloadReport: activity.sourceKind === "performed" && (strength || semantic),
    },
    notes: null,
    exerciseCount: metadata?.exerciseCount ?? null,
    completedSetCount: metadata?.completedSetCount ?? null,
    reliableVolume: metadata?.reliableVolume ?? null,
    verifiedRecordCount: metadata?.verifiedRecordCount ?? null,
    exerciseIds: [...(metadata?.exerciseIds ?? [])],
    exerciseNames: [...(metadata?.exerciseNames ?? [])],
    muscleIds: [...(metadata?.muscleIds ?? [])],
    insight: null,
    resultKind,
    resultFacts: [...(metadata?.resultFacts ?? [])],
  };
}
