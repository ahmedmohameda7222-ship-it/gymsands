"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutDayFocusSession } from "@/components/workouts/workout-day-focus-session";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { getUserWorkoutPlanDay } from "@/services/database/workout-plans";
import type { WorkoutPlanDaySession } from "@/types";

export default function WorkoutDaySessionPage() {
  const params = useParams<{ dayId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [day, setDay] = useState<WorkoutPlanDaySession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isEntered, setIsEntered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  async function loadDay() {
    setIsLoading(true);
    setLoadError(null);
    setLoadErrorDetails(undefined);
    try {
      const nextDay = await getUserWorkoutPlanDay(params.dayId);
      setDay(nextDay);
    } catch (error) {
      logRecoverableError("workout-day-session.load", error);
      const message = userSafeError(error, "This workout day could not be loaded. Retry before logging set data.");
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: "Could not start workout day", description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.dayId]);

  useEffect(() => {
    if (!day || loadError) return;
    const frame = window.requestAnimationFrame(() => setIsEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [day, loadError]);

  function closeSession() {
    setIsClosing(true);
    window.setTimeout(() => router.back(), 360);
  }

  return (
    <>
      {!day ? <PageHeading title="Start workout" description="Loading your planned exercises and saved progress." /> : null}
      {isLoading ? <CardSkeleton rows={7} /> : null}
      {!isLoading && loadError ? <ErrorState title="Workout day could not load" description={loadError} onRetry={loadDay} fallbackLabel="Back to workout plans" fallbackHref="/my-workout/plans" details={loadErrorDetails} /> : null}
      {!isLoading && !loadError && !day ? <EmptyState title="Workout day not found" description="This workout day was not found. Save your plan again, then start it from the workout calendar." actionLabel="Back to workout plans" actionHref="/my-workout/plans" /> : null}
      {!isLoading && !loadError && day ? (
        <div
          className={`workout-day-session-clean fixed inset-0 z-[120] overflow-hidden bg-background transition-transform duration-500 ease-out ${isEntered && !isClosing ? "translate-y-0" : "translate-y-full"}`}
        >
          <style>{`
            .workout-day-session-clean [class*="radial-gradient"] {
              background: transparent !important;
              background-image: none !important;
            }
          `}</style>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={closeSession}
            className="fixed right-2 top-1/2 z-[140] h-10 w-10 -translate-y-1/2 rounded-full bg-card/95 shadow-lg backdrop-blur sm:right-4"
            aria-label="Minimize workout session"
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
          <div className="h-dvh overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-6 sm:pt-5 lg:px-8">
            <WorkoutDayFocusSession day={day} />
          </div>
        </div>
      ) : null}
    </>
  );
}
