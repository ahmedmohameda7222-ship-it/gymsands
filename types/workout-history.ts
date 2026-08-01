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

export type WorkoutHistorySort = "newest" | "oldest" | "longest_duration";

export type WorkoutHistoryListRequest = {
  from: string;
  to: string;
  timezone: string;
  cursor?: string;
  limit?: number;
  search?: string;
  workoutTypes?: string[];
  muscleIds?: string[];
  exerciseIds?: string[];
  planIds?: string[];
  statuses?: WorkoutHistoryLifecycle[];
  progressOnly?: boolean;
  sort?: WorkoutHistorySort;
};

export type WorkoutHistorySessionSummary = CanonicalWorkoutActivity & {
  exerciseCount: number | null;
  completedSetCount: number | null;
  reliableVolume: number | null;
  verifiedRecordCount: number | null;
  exerciseIds: string[];
  exerciseNames: string[];
  muscleIds: string[];
  insight: string | null;
};

export type WorkoutHistoryListSummary = {
  eligibleWorkoutCount: number;
  trustedDurationMinutes: number | null;
  completedSetCount: number | null;
  reliableVolume: number | null;
  verifiedRecordCount: number | null;
};

export type WorkoutHistoryListNotice = "stale-data" | "partial-availability";

export type WorkoutHistoryListResponse = {
  contractVersion: typeof WORKOUT_HISTORY_CONTRACT_VERSION;
  period: {
    from: string;
    to: string;
    timezone: string;
  };
  summary: WorkoutHistoryListSummary;
  items: WorkoutHistorySessionSummary[];
  nextCursor: string | null;
  notices: WorkoutHistoryListNotice[];
};

export type WorkoutHistoryExerciseSetDetail = {
  id: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  completedAt: string | null;
  notes: string | null;
};

export type WorkoutHistoryExerciseDetail = {
  identity: string;
  exerciseId: string | null;
  name: string;
  category: string | null;
  plannedSetCount: number | null;
  performedSets: WorkoutHistoryExerciseSetDetail[];
};

export type WorkoutHistorySessionDetailResponse = {
  contractVersion: typeof WORKOUT_HISTORY_CONTRACT_VERSION;
  activity: CanonicalWorkoutActivity;
  exercises: WorkoutHistoryExerciseDetail[];
  notices: WorkoutHistoryListNotice[];
};
