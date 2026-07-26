"use client";

import { useMemo } from "react";

import { ActiveWorkoutCoreSession } from "@/components/workouts/active-workout/active-workout-core-session";
import type { WorkoutPlanDaySession } from "@/types";

export function WorkoutDayFocusSession({ day }: { day: WorkoutPlanDaySession }) {
  const source = useMemo(
    () => ({ kind: "plan-day" as const, day }),
    [day]
  );

  return <ActiveWorkoutCoreSession source={source} />;
}
