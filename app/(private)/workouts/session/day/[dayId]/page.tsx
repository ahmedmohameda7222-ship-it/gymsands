"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { WorkoutDayFocusSession } from "@/components/workouts/workout-day-focus-session";
import { WorkoutSessionScreen } from "@/components/workouts/workout-session-screen";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { getUserWorkoutPlanDay } from "@/services/database/workout-plans";
import type { WorkoutPlanDaySession } from "@/types";
import { useTrainTranslation } from "@/lib/i18n/train";

export default function WorkoutDaySessionPage() {
  const params = useParams<{ dayId: string }>();
  const { toast } = useToast();
  const { tr } = useTrainTranslation();
  const [day, setDay] = useState<WorkoutPlanDaySession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  async function loadDay() {
    setIsLoading(true);
    setLoadError(null);
    setLoadErrorDetails(undefined);
    try {
      const nextDay = await getUserWorkoutPlanDay(params.dayId);
      setDay(nextDay);
    } catch (error) {
      logRecoverableError("workout-day-session.load", error);
      const message = userSafeError(error, tr("workoutDayOpenFailed"));
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: tr("workoutDayUnavailable"), description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.dayId]);

  if (isLoading) return <CardSkeleton rows={7} />;
  if (loadError) {
    return (
      <ErrorState
        title={tr("workoutDayUnavailable")}
        description={loadError}
        onRetry={loadDay}
        fallbackLabel={tr("backToTrain")}
        fallbackHref="/my-workout/plans"
        details={loadErrorDetails}
      />
    );
  }
  if (!day) {
    return (
      <EmptyState
        title={tr("workoutDayNotFound")}
        description={tr("workoutDayNotFound")}
        actionLabel={tr("backToTrain")}
        actionHref="/my-workout/plans"
      />
    );
  }

  return (
    <WorkoutSessionScreen confirmExit>
      <WorkoutDayFocusSession day={day} />
    </WorkoutSessionScreen>
  );
}
