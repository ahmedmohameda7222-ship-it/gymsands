import { isValidActiveWorkoutRoute } from "@/lib/active-workout";

export type ActiveWorkoutExerciseDetailIdentity = {
  sourceWorkoutId?: string | null;
  workoutId?: string | null;
  sourcePlanActivityId?: string | null;
};

export function resolveActiveWorkoutExerciseDetailId(identity: ActiveWorkoutExerciseDetailIdentity) {
  return identity.sourceWorkoutId?.trim()
    || identity.workoutId?.trim()
    || identity.sourcePlanActivityId?.trim()
    || null;
}

export function activeWorkoutExerciseDetailHref(identifier: string, returnTo: string) {
  const query = new URLSearchParams({ returnTo });
  return `/workouts/${encodeURIComponent(identifier)}?${query.toString()}`;
}

export function validatedActiveWorkoutReturnTo(value: string | null | undefined) {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return isValidActiveWorkoutRoute(decoded) ? decoded : null;
}
