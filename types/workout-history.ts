export const WORKOUT_HISTORY_CONTRACT_VERSION = 1 as const;

export type WorkoutHistorySourceKind = "performed" | "scheduled_fallback";

export type WorkoutHistoryLifecycle =
  | "completed"
  | "partial"
  | "cancelled"
  | "skipped";

export type WorkoutHistoryCapabilities = {
  openDetails: boolean;
  showPerformedSets: boolean;
  showPlannedVsActual: boolean;
  showMuscleAnalysis: boolean;
  calculatePerformanceMetrics: boolean;
  calculateVerifiedRecords: boolean;
  repeatWorkout: boolean;
  correctSession: boolean;
  softDeleteSession: boolean;
};

export type CanonicalWorkoutActivity = {
  contractVersion: typeof WORKOUT_HISTORY_CONTRACT_VERSION;
  activityId: string;
  canonicalSessionId: string | null;
  scheduledSessionId: string | null;
  userId: string;
  sourceKind: WorkoutHistorySourceKind;
  lifecycle: WorkoutHistoryLifecycle;
  title: string;
  category: string | null;
  effectiveAt: string;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  cancelledAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  planId: string | null;
  planDayId: string | null;
  planWeekId: string | null;
  planSessionId: string | null;
  hasPerformedSets: boolean;
  hasMeaningfulPerformance: boolean;
  capabilities: WorkoutHistoryCapabilities;
};

export type WorkoutHistorySourceState = "loaded" | "failed" | "unavailable";

export type WorkoutHistorySourceNotice = {
  source: WorkoutHistorySourceKind;
  state: WorkoutHistorySourceState;
  message?: string;
};

export type CanonicalWorkoutActivityReadResult = {
  contractVersion: typeof WORKOUT_HISTORY_CONTRACT_VERSION;
  activities: CanonicalWorkoutActivity[];
  sources: {
    performed: WorkoutHistorySourceNotice;
    scheduledFallback: WorkoutHistorySourceNotice;
  };
};
