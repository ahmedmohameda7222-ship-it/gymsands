import type {
  CanonicalWorkoutActivity,
  WorkoutHistoryLifecycle,
} from "@/types/workout-history";

export type PerformedWorkoutHistoryRow = {
  id: string;
  user_id: string;
  scheduled_session_id?: string | null;
  workout_name: string;
  workout_day_name?: string | null;
  workout_category?: string | null;
  started_at: string | null;
  completed_at: string | null;
  skipped_at?: string | null;
  cancelled_at?: string | null;
  duration_minutes: number | null;
  notes: string | null;
  status: "started" | "completed" | "skipped" | "cancelled";
  plan_id?: string | null;
  plan_day_id?: string | null;
  plan_week_id?: string | null;
  plan_session_id?: string | null;
  deleted_at?: string | null;
};

export type PerformedWorkoutHistoryMetadata = {
  completedSetCount: number;
  structuredPerformedMetricCount: number;
  actualPerformedSnapshotCount: number;
  plannedSetCount: number | null;
};

export type PerformedWorkoutHistoryCandidate = {
  session: PerformedWorkoutHistoryRow;
  metadata: PerformedWorkoutHistoryMetadata;
};

export type ScheduledWorkoutHistoryRow = {
  id: string;
  user_id: string;
  user_workout_plan_id: string;
  plan_day_id: string | null;
  plan_week_id?: string | null;
  plan_session_id?: string | null;
  scheduled_date: string;
  day_title: string;
  status: "scheduled" | "started" | "completed" | "skipped";
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
};

export type WorkoutHistoryEligibilityOptions = {
  statuses?: readonly WorkoutHistoryLifecycle[];
  includeMeaningfulCancelled?: boolean;
  includeDeleted?: boolean;
};

export type ResolveWorkoutActivityInput = {
  ownerUserId: string;
  performed: readonly PerformedWorkoutHistoryCandidate[];
  scheduledTerminal: readonly ScheduledWorkoutHistoryRow[];
  eligibility?: WorkoutHistoryEligibilityOptions;
};

export type WorkoutHistoryCounts = {
  completed: number;
  partial: number;
  cancelled: number;
  skipped: number;
  total: number;
};

export function countCanonicalWorkoutActivity(
  activities: readonly CanonicalWorkoutActivity[],
): WorkoutHistoryCounts {
  const counts: WorkoutHistoryCounts = {
    completed: 0,
    partial: 0,
    cancelled: 0,
    skipped: 0,
    total: activities.length,
  };
  for (const activity of activities) counts[activity.lifecycle] += 1;
  return counts;
}
