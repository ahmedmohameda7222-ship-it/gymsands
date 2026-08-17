"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import {
  ActiveWorkoutEntryError,
  ActiveWorkoutEntryLoading
} from "@/components/workouts/active-workout/active-workout-entry-state";
import { useToast } from "@/components/ui/toaster";
import { WorkoutSessionForm } from "@/components/workouts/workout-session-form";
import { WorkoutSessionScreen } from "@/components/workouts/workout-session-screen";
import { logRecoverableError, userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getUserExerciseVideo, getWorkout } from "@/services/database/workout-library";
import { getCustomExercise } from "@/services/workouts/exercise-library-store";
import type { Workout } from "@/types";

export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const workoutId = params.id;
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { locale, tr } = useTrainTranslation();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadGenerationRef = useRef(0);

  const loadWorkout = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const customExercise = await getCustomExercise(userId ?? undefined, workoutId);
      const nextWorkout = customExercise ?? await getWorkout(workoutId, locale);
      if (generation !== loadGenerationRef.current) return;

      // The Workout is the core execution authority. Publish it immediately;
      // optional media enrichment must never gate Active Workout bootstrap.
      setWorkout(nextWorkout);
      setIsLoading(false);

      if (userId && !customExercise) {
        void getUserExerciseVideo(userId, nextWorkout.id).then((customVideo) => {
          if (generation !== loadGenerationRef.current || !customVideo?.custom_video_url) return;
          setWorkout((current) => current?.id === nextWorkout.id
            ? {
                ...current,
                video_url: customVideo.custom_video_url,
                custom_video_url: customVideo.custom_video_url
              }
            : current);
        }).catch((error) => {
          // Optional enrichment is deliberately fail-soft. The authoritative
          // workout remains usable and no fake media is substituted.
          logRecoverableError("workout-session.optional-video", error);
        });
      }
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      logRecoverableError("workout-session.load", error);
      const message = userSafeError(error, tr("workoutSessionOpenFailed"));
      setLoadError(message);
      toast({ title: tr("couldNotStartWorkout"), description: message });
    } finally {
      if (generation === loadGenerationRef.current) setIsLoading(false);
    }
  }, [locale, toast, tr, userId, workoutId]);

  useEffect(() => {
    void loadWorkout();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [loadWorkout]);

  return (
    <WorkoutSessionScreen fallbackHref="/workouts">
      {isLoading ? <ActiveWorkoutEntryLoading /> : null}
      {!isLoading && loadError ? (
        <ActiveWorkoutEntryError onRetry={() => { void loadWorkout(); }} backHref="/workouts" />
      ) : null}
      {!isLoading && !loadError && !workout ? (
        <ActiveWorkoutEntryError onRetry={() => { void loadWorkout(); }} backHref="/workouts" />
      ) : null}
      {!isLoading && !loadError && workout ? (
        <WorkoutSessionForm workout={workout} />
      ) : null}
    </WorkoutSessionScreen>
  );
}
