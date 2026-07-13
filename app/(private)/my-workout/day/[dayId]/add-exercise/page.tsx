"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/state-views";
import { userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getUserWorkoutPlanDay } from "@/services/database/workout-plans";

export default function AddExerciseToWorkoutDayRedirectPage() {
  const params = useParams<{ dayId: string }>();
  const router = useRouter();
  const { dir, tr } = useTrainTranslation();
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    getUserWorkoutPlanDay(params.dayId)
      .then((day) => {
        if (!current) return;
        if (!day?.plan_id) {
          setError(tr("workoutDayNotFound"));
          return;
        }
        router.replace(`/my-workout/plans/${day.plan_id}/edit?day=${encodeURIComponent(day.id)}&picker=exercise`);
      })
      .catch((loadError) => {
        if (current) setError(userSafeError(loadError, tr("pickerOpenFailed")));
      });
    return () => { current = false; };
  }, [params.dayId, router, tr]);

  if (error) {
    return <div dir={dir}><ErrorState title={tr("pickerUnavailable")} description={error} fallbackHref="/my-workout/plans" fallbackLabel={tr("backToTrain")} /></div>;
  }

  return <div className="min-h-48 animate-pulse rounded-2xl bg-muted" dir={dir} aria-busy="true" aria-label={tr("openingPicker")} />;
}
