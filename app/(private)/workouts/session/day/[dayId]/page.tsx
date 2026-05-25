"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutDaySession } from "@/components/workouts/workout-day-session";
import { useToast } from "@/components/ui/toaster";
import { getUserWorkoutPlanDay } from "@/services/database/repository";
import type { WorkoutPlanDaySession } from "@/types";

export default function WorkoutDaySessionPage() {
  const params = useParams<{ dayId: string }>();
  const { toast } = useToast();
  const [day, setDay] = useState<WorkoutPlanDaySession | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getUserWorkoutPlanDay(params.dayId)
      .then((nextDay) => {
        setDay(nextDay);
        setLoadError(nextDay ? "" : "Workout day was not found. Save your plan again and try starting it from the calendar.");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Could not load this workout day.";
        setLoadError(message);
        toast({ title: "Could not start workout day", description: message });
      });
  }, [params.dayId, toast]);

  if (!day) return <p className="text-sm text-muted-foreground">{loadError || "Loading workout day..."}</p>;

  return (
    <>
      <PageHeading title={`Start ${day.day_name}`} description="Follow your planned exercises, log actual sets, reps, and weight, then save the workout history." />
      <WorkoutDaySession day={day} />
    </>
  );
}
