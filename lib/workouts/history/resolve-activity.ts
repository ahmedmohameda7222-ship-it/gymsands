import type { ResolveWorkoutActivityInput } from "@/lib/workouts/history/contracts";
import {
  isPerformedWorkoutHistoryEligible,
  isScheduledWorkoutHistoryEligible,
} from "@/lib/workouts/history/eligibility";
import {
  normalizePerformedWorkoutActivity,
  normalizeScheduledWorkoutActivity,
} from "@/lib/workouts/history/normalize-activity";
import type { CanonicalWorkoutActivity } from "@/types/workout-history";

export class WorkoutHistoryOwnerMismatchError extends Error {
  constructor() {
    super("Workout History source owner mismatch.");
    this.name = "WorkoutHistoryOwnerMismatchError";
  }
}

function assertOwner(ownerUserId: string, sourceUserId: string): void {
  if (!ownerUserId || sourceUserId !== ownerUserId) {
    throw new WorkoutHistoryOwnerMismatchError();
  }
}

function compareActivityNewest(
  left: CanonicalWorkoutActivity,
  right: CanonicalWorkoutActivity,
): number {
  const timestamp = Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt);
  if (timestamp !== 0) return timestamp;
  return right.activityId.localeCompare(left.activityId);
}

export function resolveCanonicalWorkoutActivity({
  ownerUserId,
  performed,
  scheduledTerminal,
  eligibility,
}: ResolveWorkoutActivityInput): CanonicalWorkoutActivity[] {
  const linkedScheduledIds = new Set<string>();
  const seenPerformedIds = new Set<string>();
  const activities: CanonicalWorkoutActivity[] = [];

  for (const candidate of performed) {
    assertOwner(ownerUserId, candidate.session.user_id);
    if (candidate.session.scheduled_session_id) {
      linkedScheduledIds.add(candidate.session.scheduled_session_id);
    }
    if (seenPerformedIds.has(candidate.session.id)) continue;
    seenPerformedIds.add(candidate.session.id);
    const activity = normalizePerformedWorkoutActivity(candidate);
    if (
      activity &&
      isPerformedWorkoutHistoryEligible(candidate, activity.lifecycle, eligibility)
    ) {
      activities.push(activity);
    }
  }

  for (const scheduled of scheduledTerminal) {
    assertOwner(ownerUserId, scheduled.user_id);
    if (linkedScheduledIds.has(scheduled.id)) continue;
    const activity = normalizeScheduledWorkoutActivity(scheduled);
    if (
      activity &&
      isScheduledWorkoutHistoryEligible(activity.lifecycle, eligibility)
    ) {
      activities.push(activity);
    }
  }

  return activities.sort(compareActivityNewest);
}
