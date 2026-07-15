"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutSessionForm } from "@/components/workouts/workout-session-form";
import { WorkoutSessionScreen } from "@/components/workouts/workout-session-screen";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { getUserExerciseVideo, getWorkout } from "@/services/database/workout-library";
import { getCustomExercise } from "@/services/workouts/exercise-library-store";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { Workout } from "@/types";

export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const { locale, tr } = useTrainTranslation();
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
      const nextWorkout = customExercise ?? await getWorkout(params.id, locale);
      const customVideo = user?.id && !customExercise ? await getUserExerciseVideo(user.id, nextWorkout.id) : null;
      const hydratedWorkout = customVideo?.custom_video_url
        ? { ...nextWorkout, video_url: customVideo.custom_video_url, custom_video_url: customVideo.custom_video_url }
        : nextWorkout;
      setWorkout(hydratedWorkout);
    } catch (error) {
      logRecoverableError("workout-session.load", error);
      const message = userSafeError(error, tr("workoutSessionOpenFailed"));
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: tr("couldNotStartWorkout"), description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadWorkout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, params.id, user?.id]);

  return (
    <WorkoutSessionScreen confirmExit>
      <div className="mx-auto w-full max-w-[1240px] space-y-4">
      <PageHeading title={workout ? tr("startNamedWorkout", { name: workout.name }) : tr("startWorkout")} description={tr("sessionPageDescription")} />
      {isLoading ? <CardSkeleton rows={6} /> : null}
      {!isLoading && loadError ? <ErrorState title={tr("workoutSessionLoadFailed")} description={loadError} onRetry={loadWorkout} fallbackLabel={tr("backToTrain")} fallbackHref="/my-workout/plans" details={loadErrorDetails} /> : null}
      {!isLoading && !loadError && !workout ? <ErrorState title={tr("workoutNotFound")} description={tr("workoutSessionLoadFailed")} fallbackLabel={tr("backToTrain")} fallbackHref="/my-workout/plans" /> : null}
      {!isLoading && !loadError && workout ? <WorkoutSessionForm workout={workout} /> : null}
      </div>
    </WorkoutSessionScreen>
  );
}
