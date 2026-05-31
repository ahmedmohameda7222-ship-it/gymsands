"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutDayEditor } from "@/components/workouts/workout-day-editor";
import { useToast } from "@/components/ui/toaster";
import { getUserWorkoutPlanDay } from "@/services/database/repository";
import type { WorkoutPlanDaySession } from "@/types";

export default function WorkoutDayEditorPage() {
  const params = useParams<{ dayId: string }>();
  const { toast } = useToast();
  const [day, setDay] = useState<WorkoutPlanDaySession | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getUserWorkoutPlanDay(params.dayId)
      .then((nextDay) => {
        setDay(nextDay);
        setLoadError(nextDay ? "" : "Workout day was not found. Save your plan again and try opening it from My Workout.");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Could not load this workout day.";
        setLoadError(message);
        toast({ title: "Could not load workout day", description: message });
      });
  }, [params.dayId, toast]);

  if (!day) return <p className="text-sm text-muted-foreground">{loadError || "Loading workout day..."}</p>;

  return (
    <>
      <PageHeading title={`Edit ${day.day_name}`} description="Edit exercises, add new movements, reorder the day, then save your workout." />
      <WorkoutDayEditor day={day} />
    </>
  );
}
