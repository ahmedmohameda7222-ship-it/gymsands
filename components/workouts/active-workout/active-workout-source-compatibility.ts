import { workoutStorageKey } from "@/lib/workout-persistence";

export type ActiveWorkoutSourceKind = "plan-day" | "direct";

export type ActiveWorkoutStorageIdentityInput = {
  sourceKind: ActiveWorkoutSourceKind;
  sourceId: string;
  userId: string | null;
};

export type ActiveWorkoutStorageIdentities = {
  workoutTimerKey: string;
  restTimerKey: string;
};

export function activeWorkoutStorageIdentities({
  sourceKind,
  sourceId,
  userId
}: ActiveWorkoutStorageIdentityInput): ActiveWorkoutStorageIdentities {
  const sessionNamespace = sourceKind === "direct"
    ? "single-workout-session"
    : "workout-day-session";
  const restNamespace = sourceKind === "direct"
    ? "single-workout-rest"
    : "workout-day-rest-timer";
  const identity = userId ?? "anonymous";

  return {
    workoutTimerKey: workoutStorageKey([sessionNamespace, identity, sourceId]),
    restTimerKey: workoutStorageKey([restNamespace, identity, sourceId])
  };
}
