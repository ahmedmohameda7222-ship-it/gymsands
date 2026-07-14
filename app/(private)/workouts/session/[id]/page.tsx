"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutSessionForm } from "@/components/workouts/workout-session-form";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { getWorkout } from "@/services/database/workout-library";
import { getUserExerciseVideo } from "@/services/database/exercise-user-data";
import { getCustomExercise } from "@/services/workouts/exercise-library-store";
import type { Workout } from "@/types";

export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  async function loadWorkout() {
    setIsLoading(true);
    setLoadError(null);
    setLoadErrorDetails(undefined);
    try {
      const customExercise = await getCustomExercise(user?.id, params.id);
      const nextWorkout = customExercise ?? await getWorkout(params.id);
      const customVideo = user?.id && !customExercise ? await getUserExerciseVideo(user.id, nextWorkout.id) : null;
      const hydratedWorkout = customVideo?.custom_video_url
        ? { ...nextWorkout, video_url: customVideo.custom_video_url, custom_video_url: customVideo.custom_video_url }
        : nextWorkout;
      setWorkout(hydratedWorkout);
    } catch (error) {
      logRecoverableError("workout-session.load", error);
      const message = userSafeError(error, "This workout session could not be loaded. Retry before entering set data.");
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: "Could not start workout", description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadWorkout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, user?.id]);

  return (
    <>
      <PageHeading title={workout ? `Start ${workout.name}` : "Start workout"} description="Log sets, reps, weight, notes, and completion." />
      {isLoading ? <CardSkeleton rows={6} /> : null}
      {!isLoading && loadError ? <ErrorState title="Workout session could not load" description={loadError} onRetry={loadWorkout} fallbackLabel="Back to workout plans" fallbackHref="/my-workout/plans" details={loadErrorDetails} /> : null}
      {!isLoading && !loadError && !workout ? <ErrorState title="Workout not found" description="This workout could not be found. Open your workout plans and start from a saved exercise." fallbackLabel="Back to workout plans" fallbackHref="/my-workout/plans" /> : null}
      {!isLoading && !loadError && workout ? <WorkoutSessionForm workout={workout} /> : null}
    </>
  );
}
