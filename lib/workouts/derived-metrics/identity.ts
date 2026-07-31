import type { DerivedMetricLog } from "./contracts";

export function normalizeDerivedExerciseName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/^[a-z]\p{N}+\s*[:.)-]\s*/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return normalized;
}

export function derivedExerciseName(log: DerivedMetricLog): string {
  return String(log.exerciseName ?? log.exercise_name ?? "").trim();
}

export function derivedExerciseIdentity(log: DerivedMetricLog): string {
  const planActivityId = log.planActivityId ?? log.plan_activity_id;
  if (planActivityId) return `plan_activity:${planActivityId}`;
  const planExerciseId = log.planExerciseId ?? log.plan_exercise_id;
  if (planExerciseId) return `plan_exercise:${planExerciseId}`;
  const sourceWorkoutId = log.sourceWorkoutId ?? log.source_workout_id;
  if (sourceWorkoutId) return `source_workout:${sourceWorkoutId}`;
  return `name:${normalizeDerivedExerciseName(derivedExerciseName(log))}`;
}

export function derivedLogIdentity(log: DerivedMetricLog, index: number): string {
  if (log.id) return `id:${log.id}`;
  const sessionId = log.workoutSessionId ?? log.workout_session_id ?? "";
  const setNumber = log.setNumber ?? log.set_number ?? index;
  return `${sessionId}:${derivedExerciseIdentity(log)}:${setNumber}`;
}

