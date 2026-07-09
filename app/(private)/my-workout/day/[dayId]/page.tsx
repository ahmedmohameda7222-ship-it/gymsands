"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutDayEditor } from "@/components/workouts/workout-day-editor";
import { useToast } from "@/components/ui/toaster";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { getUserWorkoutPlanDay } from "@/services/database/workout-plans";
import type { WorkoutPlanDaySession } from "@/types";
import { userSafeError } from "@/lib/error-formatting";

export default function WorkoutDayEditorPage() {
  const params = useParams<{ dayId: string }>();
  const { toast } = useToast();
  const [day, setDay] = useState<WorkoutPlanDaySession | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  function loadDay() {
    setIsLoading(true);
    setLoadError("");
    getUserWorkoutPlanDay(params.dayId)
      .then((nextDay) => {
        setDay(nextDay);
        setLoadError(nextDay ? "" : "Workout day was not found. Save your plan again and try opening it from Workout Plans.");
      })
      .catch((error) => {
        const message = userSafeError(error, "Could not load this workout day. Please refresh and try again.");
        setLoadError(message);
        toast({ title: "Could not load workout day", description: message });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.dayId, toast]);

  if (isLoading) return <CardSkeleton rows={5} />;

  if (!day) {
    return (
      <ErrorState
        title="Workout day could not load"
        description={loadError || "This workout day was not found. Save your plan again and try opening it from Workout Plans."}
        onRetry={loadDay}
        fallbackLabel="Back to workout plans"
        fallbackHref="/my-workout/plans"
      />
    );
  }

  return (
    <>
      <PageHeading title={`Edit ${day.day_name}`} description="Edit exercises, add new movements, reorder the day, then save your workout." />
      <WorkoutDayEditor day={day} />
    </>
  );
}
