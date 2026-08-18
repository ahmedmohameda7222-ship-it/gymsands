"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ui/toaster";
import {
  ActiveWorkoutEntryError,
  ActiveWorkoutEntryLoading
} from "@/components/workouts/active-workout/active-workout-entry-state";
import { WorkoutDayFocusSession } from "@/components/workouts/workout-day-focus-session";
import { WorkoutSessionScreen } from "@/components/workouts/workout-session-screen";
import { logRecoverableError, userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getUserWorkoutPlanDay } from "@/services/database/workout-plans";
import type { WorkoutPlanDaySession } from "@/types";

export default function WorkoutDaySessionPage() {
  const params = useParams<{ dayId: string }>();
  const { toast } = useToast();
  const { tr } = useTrainTranslation();
  const [day, setDay] = useState<WorkoutPlanDaySession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadDay() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const nextDay = await getUserWorkoutPlanDay(params.dayId);
      setDay(nextDay);
    } catch (error) {
      logRecoverableError("workout-day-session.load", error);
      const message = userSafeError(error, tr("workoutDayOpenFailed"));
      setLoadError(message);
      toast({ title: tr("workoutDayUnavailable"), description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.dayId]);

  return (
    <WorkoutSessionScreen fallbackHref="/my-workout/plans">
      {isLoading ? <ActiveWorkoutEntryLoading /> : null}
      {!isLoading && (loadError || !day) ? (
        <ActiveWorkoutEntryError onRetry={() => { void loadDay(); }} backHref="/my-workout/plans" />
      ) : null}
      {!isLoading && !loadError && day ? <WorkoutDayFocusSession day={day} /> : null}
    </WorkoutSessionScreen>
  );
}
