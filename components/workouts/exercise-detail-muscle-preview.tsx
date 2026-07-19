"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { ExerciseMusclePreview } from "@/components/workouts/exercise-muscle-preview";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getWorkout } from "@/services/database/workout-library";
import { getCustomExercisesWithStatus } from "@/services/workouts/exercise-library-store";
import type { Workout } from "@/types";

export function ExerciseDetailMusclePreview() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { language, dir, locale } = useTrainTranslation();
  const [exercise, setExercise] = useState<Workout | null>(null);

  useEffect(() => {
    let current = true;

    void (async () => {
      try {
        const customResult = await getCustomExercisesWithStatus(user?.id);
        const customExercise = customResult.data.find((item) => item.id === params.id) ?? null;
        const nextExercise = customExercise ?? await getWorkout(params.id, locale);
        if (current) setExercise(nextExercise);
      } catch {
        if (current) setExercise(null);
      }
    })();

    return () => {
      current = false;
    };
  }, [locale, params.id, user?.id]);

  if (!exercise) return null;

  return (
    <TrainPageContainer className="pt-0" dir={dir} data-exercise-detail-muscle-preview>
      <ExerciseMusclePreview exercise={exercise} language={language} />
    </TrainPageContainer>
  );
}
