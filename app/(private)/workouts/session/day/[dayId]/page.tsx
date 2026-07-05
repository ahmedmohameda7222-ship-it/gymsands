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

export default function WorkoutDaySessionPage() {
  const params = useParams<{ dayId: string }>();
  const { toast } = useToast();
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
      const message = userSafeError(error, "This workout day could not be loaded. Retry before logging set data.");
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: "Could not start workout day", description: message });
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
        title="Workout day could not load"
        description={loadError}
        onRetry={loadDay}
        fallbackLabel="Back to workout plans"
        fallbackHref="/my-workout/plans"
        details={loadErrorDetails}
      />
    );
  }
  if (!day) {
    return (
      <EmptyState
        title="Workout day not found"
        description="This workout day was not found. Save your plan again, then start it from the workout calendar."
        actionLabel="Back to workout plans"
        actionHref="/my-workout/plans"
      />
    );
  }

  return (
    <WorkoutSessionScreen>
      <WorkoutDayFocusSession day={day} />
    </WorkoutSessionScreen>
  );
}
