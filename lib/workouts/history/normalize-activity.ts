import {
  derivePerformedWorkoutLifecycle,
  deriveScheduledWorkoutLifecycle,
  hasMeaningfulWorkoutPerformance,
} from "@/lib/workouts/history/eligibility";
import type {
  PerformedWorkoutHistoryCandidate,
  ScheduledWorkoutHistoryRow,
} from "@/lib/workouts/history/contracts";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type CanonicalWorkoutActivity,
  type WorkoutHistoryCapabilities,
  type WorkoutHistoryLifecycle,
} from "@/types/workout-history";

function performedCapabilities(
  lifecycle: WorkoutHistoryLifecycle,
  hasPerformedSets: boolean,
  hasPlannedSets: boolean,
  hasMeaningfulPerformance: boolean,
): WorkoutHistoryCapabilities {
  const isPerformance = lifecycle === "completed" || lifecycle === "partial";
  return {
    openDetails: true,
    showPerformedSets: hasPerformedSets,
    showPlannedVsActual: isPerformance && hasPlannedSets,
    showMuscleAnalysis: isPerformance,
    calculatePerformanceMetrics: isPerformance && hasMeaningfulPerformance,
    calculateVerifiedRecords: isPerformance && hasMeaningfulPerformance,
    repeatWorkout: isPerformance,
    correctSession: isPerformance,
    softDeleteSession: true,
  };
}

const SCHEDULED_FALLBACK_CAPABILITIES: WorkoutHistoryCapabilities = {
  openDetails: true,
  showPerformedSets: false,
  showPlannedVsActual: false,
  showMuscleAnalysis: false,
  calculatePerformanceMetrics: false,
  calculateVerifiedRecords: false,
  repeatWorkout: false,
  correctSession: false,
  softDeleteSession: false,
};

function requiredTimestamp(value: string | null | undefined, label: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`Workout History requires a valid ${label}.`);
  }
  return value;
}

export function normalizePerformedWorkoutActivity(
  candidate: PerformedWorkoutHistoryCandidate,
): CanonicalWorkoutActivity | null {
  const { session, metadata } = candidate;
  const lifecycle = derivePerformedWorkoutLifecycle(candidate);
  if (!lifecycle) return null;
  const meaningful = hasMeaningfulWorkoutPerformance(metadata);
  const effectiveAt =
    lifecycle === "cancelled"
      ? session.cancelled_at ?? session.completed_at ?? session.started_at
      : lifecycle === "skipped"
        ? session.skipped_at ?? session.completed_at ?? session.started_at
        : session.completed_at ?? session.started_at;
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activityId: session.id,
    canonicalSessionId: session.id,
    scheduledSessionId: session.scheduled_session_id ?? null,
    userId: session.user_id,
    sourceKind: "performed",
    lifecycle,
    title: session.workout_day_name || session.workout_name,
    category: session.workout_category ?? null,
    effectiveAt: requiredTimestamp(effectiveAt, "performed effective timestamp"),
    startedAt: session.started_at,
    completedAt: session.completed_at,
    skippedAt: session.skipped_at ?? null,
    cancelledAt: session.cancelled_at ?? null,
    durationMinutes: session.duration_minutes,
    notes: session.notes,
    planId: session.plan_id ?? null,
    planDayId: session.plan_day_id ?? null,
    planWeekId: session.plan_week_id ?? null,
    planSessionId: session.plan_session_id ?? null,
    hasPerformedSets: metadata.completedSetCount > 0,
    hasMeaningfulPerformance: meaningful,
    capabilities: performedCapabilities(
      lifecycle,
      metadata.completedSetCount > 0,
      metadata.plannedSetCount !== null && metadata.plannedSetCount > 0,
      meaningful,
    ),
  };
}

export function normalizeScheduledWorkoutActivity(
  session: ScheduledWorkoutHistoryRow,
): CanonicalWorkoutActivity | null {
  const lifecycle = deriveScheduledWorkoutLifecycle(session);
  if (!lifecycle) return null;
  const fallbackAt = `${session.scheduled_date}T00:00:00.000Z`;
  const effectiveAt =
    lifecycle === "skipped"
      ? session.skipped_at ?? session.completed_at ?? session.started_at ?? fallbackAt
      : session.completed_at ?? session.started_at ?? fallbackAt;
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activityId: `scheduled:${session.id}`,
    canonicalSessionId: null,
    scheduledSessionId: session.id,
    userId: session.user_id,
    sourceKind: "scheduled_fallback",
    lifecycle,
    title: session.day_title,
    category: null,
    effectiveAt: requiredTimestamp(effectiveAt, "scheduled effective timestamp"),
    startedAt: session.started_at,
    completedAt: session.completed_at,
    skippedAt: session.skipped_at,
    cancelledAt: null,
    durationMinutes: session.duration_minutes,
    notes: session.notes,
    planId: session.user_workout_plan_id,
    planDayId: session.plan_day_id,
    planWeekId: session.plan_week_id ?? null,
    planSessionId: session.plan_session_id ?? null,
    hasPerformedSets: false,
    hasMeaningfulPerformance: false,
    capabilities: SCHEDULED_FALLBACK_CAPABILITIES,
  };
}
