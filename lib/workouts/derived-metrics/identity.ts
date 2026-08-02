import type {
  DerivedExerciseIdentityKind,
  DerivedMetricLog,
} from "./contracts";

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

export type DerivedExerciseIdentity = {
  kind: DerivedExerciseIdentityKind;
  identity: string;
  degraded: boolean;
};

function frozenIdentity(
  kind: DerivedMetricLog["actualExerciseIdentityKind"],
  identity: string | null | undefined,
): DerivedExerciseIdentity | null {
  if (!kind || !identity) return null;
  if (!identity.startsWith(`${kind}:`)) return null;
  return { kind, identity, degraded: false };
}

export function derivedExerciseIdentityParts(log: DerivedMetricLog): DerivedExerciseIdentity {
  const actual = frozenIdentity(log.actualExerciseIdentityKind, log.actualExerciseIdentity);
  if (actual) return actual;
  const planned = frozenIdentity(log.plannedExerciseIdentityKind, log.plannedExerciseIdentity);
  if (planned) return planned;
  const planActivityId = log.planActivityId ?? log.plan_activity_id;
  if (planActivityId) return { kind: "plan_activity", identity: `plan_activity:${planActivityId}`, degraded: false };
  const planExerciseId = log.planExerciseId ?? log.plan_exercise_id;
  if (planExerciseId) return { kind: "plan_exercise", identity: `plan_exercise:${planExerciseId}`, degraded: false };
  const sourceWorkoutId = log.sourceWorkoutId ?? log.source_workout_id;
  if (sourceWorkoutId) return { kind: "source_workout", identity: `source_workout:${sourceWorkoutId}`, degraded: false };
  return {
    kind: "name_degraded",
    identity: `name:${normalizeDerivedExerciseName(derivedExerciseName(log))}`,
    degraded: true,
  };
}

export function derivedExerciseIdentity(log: DerivedMetricLog): string {
  return derivedExerciseIdentityParts(log).identity;
}

export function derivedLogIdentity(log: DerivedMetricLog, index: number): string {
  if (log.id) return `id:${log.id}`;
  const sessionId = log.workoutSessionId ?? log.workout_session_id ?? "";
  const setNumber = log.setNumber ?? log.set_number ?? index;
  return `${sessionId}:${derivedExerciseIdentity(log)}:${setNumber}`;
}
