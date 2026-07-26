"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { ActiveWorkoutCoreSession } from "@/components/workouts/active-workout/active-workout-core-session";
import { WorkoutDayFocusSession } from "@/components/workouts/workout-day-focus-session";
import { WorkoutSessionScreen } from "@/components/workouts/workout-session-screen";
import { Button } from "@/components/ui/button";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getUserWorkoutPlanDay } from "@/services/database/workout-plans";
import type { WorkoutPlanDaySession } from "@/types";

export default function WorkoutDaySessionPage() {
  const params = useParams<{ dayId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { tr } = useTrainTranslation();
  const [day, setDay] = useState<WorkoutPlanDaySession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const legacySurface = searchParams.get("legacy");
  const coreSource = useMemo(() => day ? ({ kind: "plan-day" as const, day }) : null, [day]);

  async function loadDay() {
    setIsLoading(true);
    setLoadError(null);
    setLoadErrorDetails(undefined);
    try {
      const nextDay = await getUserWorkoutPlanDay(params.dayId);
      setDay(nextDay);
    } catch (error) {
      logRecoverableError("workout-day-session.load", error);
      const message = userSafeError(error, tr("workoutDayOpenFailed"));
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: tr("workoutDayUnavailable"), description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.dayId]);

  function setLegacySurface(surface: "details" | "review" | null) {
    const query = new URLSearchParams(searchParams.toString());
    if (surface) query.set("legacy", surface);
    else query.delete("legacy");
    const suffix = query.toString();
    router.replace(`/workouts/session/day/${params.dayId}${suffix ? `?${suffix}` : ""}`);
  }

  if (isLoading) return <CardSkeleton rows={7} />;
  if (loadError) {
    return (
      <ErrorState
        title={tr("workoutDayUnavailable")}
        description={loadError}
        onRetry={loadDay}
        fallbackLabel={tr("backToTrain")}
        fallbackHref="/my-workout/plans"
        details={loadErrorDetails}
      />
    );
  }
  if (!day || !coreSource) {
    return (
      <EmptyState
        title={tr("workoutDayNotFound")}
        description={tr("workoutDayNotFound")}
        actionLabel={tr("backToTrain")}
        actionHref="/my-workout/plans"
      />
    );
  }

  return (
    <WorkoutSessionScreen confirmExit>
      {legacySurface ? (
        <div className="mx-auto w-full max-w-[1240px] space-y-3" data-aw5-legacy-bridge={legacySurface}>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setLegacySurface(null)}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("returnToWorkout")}
          </Button>
          <WorkoutDayFocusSession day={day} />
        </div>
      ) : (
        <ActiveWorkoutCoreSession
          source={coreSource}
          onOpenLegacySurface={(surface) => setLegacySurface(surface)}
        />
      )}
    </WorkoutSessionScreen>
  );
}
