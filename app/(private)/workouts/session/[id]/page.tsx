"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutSessionForm } from "@/components/workouts/workout-session-form";
import { useToast } from "@/components/ui/toaster";
import { getWorkout } from "@/services/database/repository";
import type { Workout } from "@/types";

export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getWorkout(params.id)
      .then((nextWorkout) => {
        setWorkout(nextWorkout);
        setLoadError("");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Could not load workout session.";
        setLoadError(message);
        toast({ title: "Could not start workout", description: message });
      });
  }, [params.id, toast]);

  if (!workout) return <p className="text-sm text-muted-foreground">{loadError || "Loading workout session..."}</p>;

  return (
    <>
      <PageHeading title={`Start ${workout.name}`} description="Log sets, reps, weight, notes, and completion." />
      <WorkoutSessionForm workout={workout} />
    </>
  );
}
