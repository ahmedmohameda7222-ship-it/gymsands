"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { toCatalogLocale } from "@/lib/activity-catalog/catalog-locale";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { isUuid } from "@/lib/utils";
import { validatedActiveWorkoutReturnTo } from "@/lib/workouts/active-workout-detail-navigation";
import { CatalogClientError } from "@/services/activity-catalog/client";
import { getWorkoutPlanById } from "@/services/database/workout-plan-loader";
import { resolveExerciseDetail, type ResolvedExerciseDetail } from "@/services/exercise-detail/client";
import { getFavoriteExerciseIdsWithStatus, setFavoriteExercise } from "@/services/workouts/exercise-library-store";

type CoreState = "loading" | "ready" | "not_found" | "failed";
export type ExercisePlanContext = {
  planId: string;
  planName: string;
  dayId: string;
  dayName: string;
  planExerciseId: string;
  sets: number | null;
  reps: string | null;
  restSeconds: number | null;
  note: string | null;
  backHref: string;
};

type ExerciseDetailContextValue = {
  state: CoreState;
  resolved: ResolvedExerciseDetail | null;
  retry: () => void;
  favorite: boolean;
  favoritePending: boolean;
  toggleFavorite: () => Promise<void>;
  navigationQuery: string;
  childHref: (child?: "anatomy" | "technique" | "performance" | "alternatives" | "details") => string;
  backHref: string;
  planContext: ExercisePlanContext | null;
  userId: string | null;
};

const ExerciseDetailContext = createContext<ExerciseDetailContextValue | null>(null);

function buildNavigationQuery(input: { returnTo: string | null; planId: string | null; planExerciseId: string | null }) {
  const query = new URLSearchParams();
  if (input.returnTo) query.set("returnTo", input.returnTo);
  else if (input.planId && input.planExerciseId) {
    query.set("planId", input.planId);
    query.set("planExerciseId", input.planExerciseId);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function ExerciseDetailProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { language, locale, ed } = useExerciseDetailTranslation();
  const catalogLocale = toCatalogLocale(language);
  const [state, setState] = useState<CoreState>("loading");
  const [resolved, setResolved] = useState<ResolvedExerciseDetail | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritePending, setFavoritePending] = useState(false);
  const [planContext, setPlanContext] = useState<ExercisePlanContext | null>(null);
  const coreGeneration = useRef(0);

  const activeReturnTo = validatedActiveWorkoutReturnTo(search.get("returnTo"));
  const requestedPlanId = isUuid(search.get("planId")) ? search.get("planId") : null;
  const requestedPlanExerciseId = isUuid(search.get("planExerciseId")) ? search.get("planExerciseId") : null;
  const navigationQuery = buildNavigationQuery({ returnTo: activeReturnTo, planId: requestedPlanId, planExerciseId: requestedPlanExerciseId });

  useEffect(() => {
    const generation = ++coreGeneration.current;
    const controller = new AbortController();
    setState("loading");
    setResolved(null);
    void resolveExerciseDetail(params.id, user?.id, locale, catalogLocale, controller.signal)
      .then((next) => {
        if (controller.signal.aborted || generation !== coreGeneration.current) return;
        setResolved(next);
        setState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted || generation !== coreGeneration.current) return;
        setState(error instanceof CatalogClientError && error.status === 404 ? "not_found" : "failed");
      });
    return () => controller.abort();
  }, [catalogLocale, locale, params.id, retryGeneration, user?.id]);

  useEffect(() => {
    if (!user?.id) { setFavorites([]); return; }
    let current = true;
    void getFavoriteExerciseIdsWithStatus(user.id)
      .then((result) => { if (current) setFavorites(result.data); })
      .catch(() => { if (current) setFavorites([]); });
    return () => { current = false; };
  }, [user?.id]);

  useEffect(() => {
    setPlanContext(null);
    if (activeReturnTo || !user?.id || !requestedPlanId || !requestedPlanExerciseId || !resolved) return;
    let current = true;
    void getWorkoutPlanById(user.id, requestedPlanId).then((plan) => {
      if (!current || !plan) return;
      for (const day of plan.days) {
        const exercise = day.exercises.find((candidate) => candidate.id === requestedPlanExerciseId);
        if (!exercise) continue;
        const sourceId = exercise.source_workout_id ?? exercise.workout_id;
        if (!sourceId || ![resolved.core.identity.activityId, resolved.core.identity.revisionId, resolved.core.identity.slug].filter(Boolean).includes(sourceId)) return;
        setPlanContext({
          planId: plan.id,
          planName: plan.name,
          dayId: day.id,
          dayName: day.day_name,
          planExerciseId: exercise.id,
          sets: exercise.sets,
          reps: exercise.reps,
          restSeconds: exercise.rest_seconds,
          note: exercise.notes,
          backHref: `/my-workout/plans/${encodeURIComponent(plan.id)}?day=${encodeURIComponent(day.id)}`
        });
        return;
      }
    }).catch(() => undefined);
    return () => { current = false; };
  }, [activeReturnTo, requestedPlanExerciseId, requestedPlanId, resolved, user?.id]);

  const favorite = Boolean(resolved && favorites.includes(resolved.core.identity.activityId));
  const toggleFavorite = useCallback(async () => {
    if (!resolved || !user?.id || favoritePending) return;
    const id = resolved.core.identity.activityId;
    const previous = favorites;
    const next = favorite ? previous.filter((value) => value !== id) : [...previous, id];
    setFavoritePending(true);
    setFavorites(next);
    try {
      setFavorites(await setFavoriteExercise(user.id, id, !favorite));
    } catch {
      setFavorites(previous);
      toast({ title: ed("favoriteFailed") });
    } finally {
      setFavoritePending(false);
    }
  }, [ed, favorite, favoritePending, favorites, resolved, toast, user?.id]);

  const childHref = useCallback((child?: "anatomy" | "technique" | "performance" | "alternatives" | "details") => {
    const base = `/workouts/${encodeURIComponent(params.id)}${child ? `/${child}` : ""}`;
    return `${base}${navigationQuery}`;
  }, [navigationQuery, params.id]);

  const backHref = activeReturnTo ?? planContext?.backHref ?? "/workouts";
  const value = useMemo<ExerciseDetailContextValue>(() => ({
    state,
    resolved,
    retry: () => setRetryGeneration((value) => value + 1),
    favorite,
    favoritePending,
    toggleFavorite,
    navigationQuery,
    childHref,
    backHref,
    planContext,
    userId: user?.id ?? null
  }), [backHref, childHref, favorite, favoritePending, navigationQuery, planContext, resolved, state, toggleFavorite, user?.id]);

  return <ExerciseDetailContext.Provider value={value}>{children}</ExerciseDetailContext.Provider>;
}

export function useExerciseDetail() {
  const value = useContext(ExerciseDetailContext);
  if (!value) throw new Error("useExerciseDetail must be used inside ExerciseDetailProvider");
  return value;
}
