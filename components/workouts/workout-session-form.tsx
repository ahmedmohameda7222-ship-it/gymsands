"use client";

import { useMemo } from "react";

import { ActiveWorkoutCoreSession } from "@/components/workouts/active-workout/active-workout-core-session";
import type { Workout } from "@/types";

export function WorkoutSessionForm({ workout }: { workout: Workout }) {
  const source = useMemo(
    () => ({ kind: "direct" as const, workout }),
    [workout]
  );

  return <ActiveWorkoutCoreSession source={source} />;
}
