"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { WorkoutSessionForm } from "@/components/workouts/workout-session-form";
import { WorkoutSessionScreen } from "@/components/workouts/workout-session-screen";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getUserExerciseVideo, getWorkout } from "@/services/database/workout-library";
import { getCustomExercise } from "@/services/workouts/exercise-library-store";
import type { Workout } from "@/types";

export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;
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
      const customExercise = await getCustomExercise(userId ?? undefined, params.id);
      const nextWorkout = customExercise ?? await getWorkout(params.id, locale);
      const customVideo = userId && !customExercise
        ? await getUserExerciseVideo(userId, nextWorkout.id)
        : null;
      const hydratedWorkout = customVideo?.custom_video_url
        ? {
            ...nextWorkout,
            video_url: customVideo.custom_video_url,
            custom_video_url: customVideo.custom_video_url
          }
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
    void loadWorkout();
    // The primitive route, locale, and user identities are the only load boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, params.id, userId]);

  return (
    <WorkoutSessionScreen confirmExit>
      {isLoading ? (
        <div className="mx-auto w-full max-w-3xl pt-20">
          <h1 className="mb-4 text-lg font-semibold">{tr("startWorkout")}</h1>
          <CardSkeleton rows={6} />
        </div>
      ) : null}
      {!isLoading && loadError ? (
        <div className="mx-auto w-full max-w-3xl pt-20">
          <ErrorState
            title={tr("workoutSessionLoadFailed")}
            description={loadError}
            onRetry={loadWorkout}
            fallbackLabel={tr("backToTrain")}
            fallbackHref="/my-workout/plans"
            details={loadErrorDetails}
          />
        </div>
      ) : null}
      {!isLoading && !loadError && !workout ? (
        <div className="mx-auto w-full max-w-3xl pt-20">
          <ErrorState
            title={tr("workoutNotFound")}
            description={tr("workoutSessionLoadFailed")}
            fallbackLabel={tr("backToTrain")}
            fallbackHref="/my-workout/plans"
          />
        </div>
      ) : null}
      {!isLoading && !loadError && workout ? (
        <WorkoutSessionForm workout={workout} />
      ) : null}
    </WorkoutSessionScreen>
  );
}
