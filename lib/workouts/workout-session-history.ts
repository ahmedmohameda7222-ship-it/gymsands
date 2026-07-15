import type { ExerciseLog, Workout, WorkoutSessionSummary } from "@/types";

export type PreviousWorkoutSet = { reps: number | null; weightKg: number | null; performedAt: string | null };

function normalizedName(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function hasPerformance(log: ExerciseLog) {
  return Number(log.reps ?? 0) > 0 || Number(log.weight_kg ?? 0) > 0;
}

export function findPreviousWorkoutSet(history: WorkoutSessionSummary[], workout: Workout): PreviousWorkoutSet | null {
  const external = workout.catalog_source === "external";
  const expectedName = normalizedName(workout.name);
  const candidates = history.flatMap((session) => (session.exercise_logs ?? [])
    .filter(hasPerformance)
    .filter((log) => {
      if (external) return log.source_workout_id === workout.id;
      if (log.source_workout_id) return log.source_workout_id === workout.id;
      if (session.workout_id) return session.workout_id === workout.id && normalizedName(log.exercise_name) === expectedName;
      return workout.catalog_source === "custom" && normalizedName(log.exercise_name) === expectedName;
    })
    .map((log) => ({
      log,
      performedAt: session.completed_at || session.started_at,
      timestamp: new Date(log.completed_at || log.created_at || session.completed_at || session.started_at).getTime()
    }))
  ).sort((left, right) => right.timestamp - left.timestamp);
  const latest = candidates[0];
  return latest ? { reps: latest.log.reps, weightKg: latest.log.weight_kg, performedAt: latest.performedAt } : null;
}
