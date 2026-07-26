"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { ActiveWorkoutCoreSession } from "@/components/workouts/active-workout/active-workout-core-session";
import { WorkoutSessionForm } from "@/components/workouts/workout-session-form";
import { WorkoutSessionScreen } from "@/components/workouts/workout-session-screen";
import { useAuth } from "@/components/auth/auth-provider";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getUserExerciseVideo, getWorkout } from "@/services/database/workout-library";
import { getCustomExercise } from "@/services/workouts/exercise-library-store";
import type { Workout } from "@/types";

export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { locale, tr } = useTrainTranslation();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const legacySurface = searchParams.get("legacy");

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

  function setLegacySurface(surface: "details" | "review" | null) {
    const query = new URLSearchParams(searchParams.toString());
    if (surface) query.set("legacy", surface);
    else query.delete("legacy");
    const suffix = query.toString();
    router.replace(`/workouts/session/${params.id}${suffix ? `?${suffix}` : ""}`);
  }

  return (
    <WorkoutSessionScreen confirmExit>
      {isLoading ? <CardSkeleton rows={6} /> : null}
      {!isLoading && loadError ? <ErrorState title={tr("workoutSessionLoadFailed")} description={loadError} onRetry={loadWorkout} fallbackLabel={tr("backToTrain")} fallbackHref="/my-workout/plans" details={loadErrorDetails} /> : null}
      {!isLoading && !loadError && !workout ? <ErrorState title={tr("workoutNotFound")} description={tr("workoutSessionLoadFailed")} fallbackLabel={tr("backToTrain")} fallbackHref="/my-workout/plans" /> : null}
      {!isLoading && !loadError && workout ? (
        legacySurface ? (
          <div className="mx-auto w-full max-w-[1240px] space-y-4" data-aw5-legacy-bridge={legacySurface}>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setLegacySurface(null)}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("returnToWorkout")}
            </Button>
            <PageHeading title={tr("startNamedWorkout", { name: workout.name })} description={tr("sessionPageDescription")} />
            <WorkoutSessionForm workout={workout} />
          </div>
        ) : (
          <ActiveWorkoutCoreSession
            source={{ kind: "direct", workout }}
            onOpenLegacySurface={(surface) => setLegacySurface(surface)}
          />
        )
      ) : null}
    </WorkoutSessionScreen>
  );
}
