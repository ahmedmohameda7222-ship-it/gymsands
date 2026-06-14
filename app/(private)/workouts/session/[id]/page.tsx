"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutSessionForm } from "@/components/workouts/workout-session-form";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { getUserExerciseVideo, getWorkout } from "@/services/database/repository";
import { getCustomExercise } from "@/services/workouts/exercise-library-store";
import type { Workout } from "@/types";

export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadWorkout() {
      try {
        const customExercise = getCustomExercise(user?.id, params.id);
        const nextWorkout = customExercise ?? await getWorkout(params.id);
        const customVideo = user?.id && !customExercise ? await getUserExerciseVideo(user.id, nextWorkout.id) : null;
        if (!active) return;
        const hydratedWorkout = customVideo?.custom_video_url
          ? { ...nextWorkout, video_url: customVideo.custom_video_url, custom_video_url: customVideo.custom_video_url }
          : nextWorkout;
        setWorkout(hydratedWorkout);
        setLoadError("");
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Could not load workout session.";
        setLoadError(message);
        toast({ title: "Could not start workout", description: message });
      }
    }

    loadWorkout();
    return () => {
      active = false;
    };
  }, [params.id, toast, user?.id]);

  if (!workout) return <p className="text-sm text-muted-foreground">{loadError || "Loading workout session..."}</p>;

  return (
    <>
      <PageHeading title={`Start ${workout.name}`} description="Log sets, reps, weight, notes, and completion." />
      <WorkoutSessionForm workout={workout} />
    </>
  );
}
