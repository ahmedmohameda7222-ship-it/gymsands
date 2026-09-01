"use client";

import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  ShoppingCart,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { TodayProgress } from "@/components/dashboard/today-progress";
import { WellnessToday } from "@/components/dashboard/wellness-today";
import { PageHeading } from "@/components/layout/page-heading";
import { InlineFeedback } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import type { QuickPromptContext } from "@/lib/ai/quick-prompts";
import {
  useDashboardContextPublication,
  useDashboardRemainingMacros,
} from "@/lib/dashboard/dashboard-context-publication";
import {
  getFocusedTodayCopy,
  interpolateFocusedTodayCopy,
} from "@/lib/dashboard/focused-today-copy";
import type {
  TodayMealPlanItemProjection,
  TodayProjectionResponseV1,
  TodayShoppingItemProjection,
} from "@/lib/dashboard/today-projection-contract";
import {
  dashboardRequestKey,
  isDashboardRequestCurrent,
  type DashboardSourceState,
} from "@/lib/dashboard/today-request";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { userSafeError } from "@/lib/error-formatting";
import { subscribeToTodayNutritionTargetChanges } from "@/services/database/today-nutrition";
import { getTodayProjection } from "@/services/dashboard/today-client";
import {
  markTodayMealDone,
  markTodayMealSkipped,
  markTodayMealsSkipped,
  toggleTodayShoppingItem,
} from "@/services/dashboard/today-mutations";
import type { SavedTargets } from "@/services/nutrition/targets";

const INITIAL_GENERATION = 0;

type ProjectionLoadState = "idle" | "loading" | "loaded" | "failed";
type LoadOptions = { force?: boolean; preserveContent?: boolean };
type RequestAuthority = {
  key: string | null;
  generation: number;
  controller: AbortController | null;
  promise: Promise<TodayProjectionResponseV1 | null> | null;
  resolvedKey: string | null;
};

function mealTypeLabel(
  value: string | undefined,
  copy: ReturnType<typeof getFocusedTodayCopy>,
) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "breakfast") return copy.breakfast;
  if (normalized === "lunch") return copy.lunch;
  if (normalized === "dinner") return copy.dinner;
  if (normalized === "snack") return copy.snack;
  return value?.trim() || copy.snack;
}

function selectRelevantMeal(items: TodayMealPlanItemProjection[], hour: number) {
  const open = items.filter((item) => item.status === "planned");
  if (!open.length) return null;
  const preferred =
    hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 18 ? "snack" : "dinner";
  return (
    open.find((item) => item.mealSlotKey.trim().toLowerCase() === preferred) ??
    open[0]
  );
}

function projectionSourceState(
  projection: TodayProjectionResponseV1 | null,
  sourceState: "loaded" | "failed" | undefined,
  loadState: ProjectionLoadState,
): DashboardSourceState {
  if (projection && sourceState) return sourceState;
  if (loadState === "failed") return "failed";
  if (loadState === "loading") return "loading";
  return "idle";
}

function progressSourceState(
  state: DashboardSourceState,
): "loading" | "loaded" | "failed" {
  return state === "failed" ? "failed" : state === "loaded" ? "loaded" : "loading";
}

function updateMealProjection(
  projection: TodayProjectionResponseV1,
  items: TodayMealPlanItemProjection[],
): TodayProjectionResponseV1 {
  if (projection.meals.state !== "loaded") return projection;
  const plannedCount = items.filter((item) => item.status === "planned").length;
  return {
    ...projection,
    meals: {
      state: "loaded",
      errorCode: null,
      value: { items, itemCount: items.length, plannedCount },
    },
    promptContext: {
      ...projection.promptContext,
      nutrition: {
        ...projection.promptContext.nutrition,
        mealPlanCount: items.length,
        plannedMealCount: plannedCount,
      },
    },
  };
}

function restoreOptimisticMealItems(
  projection: TodayProjectionResponseV1,
  previousById: Map<string, TodayMealPlanItemProjection>,
) {
  if (projection.meals.state !== "loaded") return projection;
  return updateMealProjection(
    projection,
    projection.meals.value.items.map((item) => {
      const previous = previousById.get(item.id);
      return previous && item.status === "skipped" ? previous : item;
    }),
  );
}

function reconcileSkippedMealItems(
  projection: TodayProjectionResponseV1,
  previousById: Map<string, TodayMealPlanItemProjection>,
  saved: TodayMealPlanItemProjection[],
) {
  if (projection.meals.state !== "loaded") return projection;
  const savedById = new Map(saved.map((item) => [item.id, item]));
  return updateMealProjection(
    projection,
    projection.meals.value.items.map((item) => {
      const authoritative = savedById.get(item.id);
      if (authoritative) return authoritative;
      const previous = previousById.get(item.id);
      return previous && item.status === "skipped" ? previous : item;
    }),
  );
}

function applyMealCompletion(
  projection: TodayProjectionResponseV1,
  result: Awaited<ReturnType<typeof markTodayMealDone>>,
): { projection: TodayProjectionResponseV1; needsRefresh: boolean } {
  if (projection.meals.state !== "loaded") {
    return { projection, needsRefresh: true };
  }
  const items = projection.meals.value.items.map((item) =>
    item.id === result.item.id ? result.item : item,
  );
  return {
    projection: updateMealProjection(projection, items),
    // Actual Diary facts are grouped canonical records. Re-read server authority
    // instead of inventing client-side macro deltas from a planned snapshot.
    needsRefresh: true,
  };
}

export function TodayDashboard() {
  const { user, profile, session } = useAuth();
  const { language, dir } = useTranslation();
  const { settings } = useUserSettings();
  const copy = getFocusedTodayCopy(language);
  const { toast } = useToast();
  const { openPrompts, setDashboardContext } = useQuickChatGpt();
  const today = useTodayDate();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const userId = user?.id ?? null;
  const currentRequestKey = dashboardRequestKey(userId, today, timezone);
  const accessTokenRef = useRef<string | null>(session?.access_token ?? null);
  const authorityRef = useRef<RequestAuthority>({
    key: null,
    generation: INITIAL_GENERATION,
    controller: null,
    promise: null,
    resolvedKey: null,
  });
  const projectionRef = useRef<TodayProjectionResponseV1 | null>(null);

  const [projection, setProjection] = useState<TodayProjectionResponseV1 | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<ProjectionLoadState>("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shoppingExpanded, setShoppingExpanded] = useState(false);
  const [boughtExpanded, setBoughtExpanded] = useState(false);
  const [pendingMealIds, setPendingMealIds] = useState<Set<string>>(new Set());
  const [pendingGroceryIds, setPendingGroceryIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [localHour] = useState(() => new Date().getHours());

  useEffect(() => {
    accessTokenRef.current = session?.access_token ?? null;
  }, [session?.access_token]);

  const operationIsCurrent = useCallback(
    (key: string, generation: number) =>
      isDashboardRequestCurrent({
        activeGeneration: authorityRef.current.generation,
        requestGeneration: generation,
        activeKey: authorityRef.current.key ?? "",
        requestKey: key,
      }),
    [],
  );

  const publishProjection = useCallback(
    (next: TodayProjectionResponseV1, key: string, generation: number) => {
      if (!operationIsCurrent(key, generation)) return false;
      projectionRef.current = next;
      authorityRef.current.resolvedKey = key;
      setProjection(next);
      setResolvedKey(key);
      setLoadState("loaded");
      setIsRefreshing(false);
      return true;
    },
    [operationIsCurrent],
  );

  const loadProjection = useCallback(
    (options: LoadOptions = {}) => {
      if (!userId) return Promise.resolve(null);
      const authority = authorityRef.current;
      if (authority.key !== currentRequestKey) {
        authority.controller?.abort();
        authority.key = currentRequestKey;
        authority.generation += 1;
        authority.controller = null;
        authority.promise = null;
        authority.resolvedKey = null;
        projectionRef.current = null;
      }
      if (authority.promise) return authority.promise;
      if (!options.force && authority.resolvedKey === currentRequestKey) {
        return Promise.resolve(projectionRef.current);
      }

      authority.generation += 1;
      const generation = authority.generation;
      const controller = new AbortController();
      authority.controller = controller;
      if (options.preserveContent && projectionRef.current) setIsRefreshing(true);
      else setLoadState("loading");

      const request = getTodayProjection(userId, today, timezone, {
        accessToken: accessTokenRef.current,
        signal: controller.signal,
      })
        .then((next) => {
          publishProjection(next, currentRequestKey, generation);
          return next;
        })
        .catch((error) => {
          if (controller.signal.aborted || !operationIsCurrent(currentRequestKey, generation)) {
            return null;
          }
          setIsRefreshing(false);
          if (!projectionRef.current) setLoadState("failed");
          toast({
            title: copy.sectionUnavailable,
            description: userSafeError(error, copy.sectionUnavailable),
            variant: "error",
          });
          return null;
        })
        .finally(() => {
          if (
            authorityRef.current.promise === request &&
            operationIsCurrent(currentRequestKey, generation)
          ) {
            authorityRef.current.promise = null;
            authorityRef.current.controller = null;
          }
        });
      authority.promise = request;
      return request;
    },
    [
      copy.sectionUnavailable,
      currentRequestKey,
      operationIsCurrent,
      publishProjection,
      timezone,
      toast,
      today,
      userId,
    ],
  );
  const loadProjectionRef = useRef(loadProjection);

  useEffect(() => {
    loadProjectionRef.current = loadProjection;
  }, [loadProjection]);

  useEffect(() => {
    const authority = authorityRef.current;
    if (authority.key !== currentRequestKey) {
      authority.controller?.abort();
      authority.key = currentRequestKey;
      authority.generation += 1;
      authority.controller = null;
      authority.promise = null;
      authority.resolvedKey = null;
      projectionRef.current = null;
      setProjection(null);
      setResolvedKey(null);
      setLoadState(userId ? "loading" : "idle");
      setIsRefreshing(false);
      setShoppingExpanded(false);
      setBoughtExpanded(false);
      setPendingMealIds(new Set());
      setPendingGroceryIds(new Set());
      setFeedback("");
    }
    if (userId) void loadProjectionRef.current();
  }, [currentRequestKey, userId]);

  useEffect(
    () => () => {
      authorityRef.current.generation += 1;
      authorityRef.current.controller?.abort();
      authorityRef.current.controller = null;
      authorityRef.current.promise = null;
      projectionRef.current = null;
    },
    [],
  );

  const retryProjection = useCallback(
    () => loadProjection({ force: true, preserveContent: true }),
    [loadProjection],
  );

  useEffect(
    () =>
      subscribeToTodayNutritionTargetChanges(window, today, () => {
        void retryProjection();
      }),
    [retryProjection, today],
  );

  const visibleProjection =
    resolvedKey === currentRequestKey ? projection : null;
  const workoutState = projectionSourceState(
    visibleProjection,
    visibleProjection?.workout.state,
    loadState,
  );
  const mealsState = projectionSourceState(
    visibleProjection,
    visibleProjection?.meals.state,
    loadState,
  );
  const logsState = projectionSourceState(
    visibleProjection,
    visibleProjection?.nutrition.logs.state,
    loadState,
  );
  const targetsState = projectionSourceState(
    visibleProjection,
    visibleProjection?.nutrition.targets.state,
    loadState,
  );
  const hydrationState = projectionSourceState(
    visibleProjection,
    visibleProjection?.hydration.state,
    loadState,
  );
  const shoppingState = projectionSourceState(
    visibleProjection,
    visibleProjection?.shopping.state,
    loadState,
  );
  const wellnessState = visibleProjection
    ? visibleProjection.wellness.state
    : loadState === "failed"
      ? "failed"
      : "loading";

  const workout =
    visibleProjection?.workout.state === "loaded"
      ? visibleProjection.workout.value
      : null;
  const meals =
    visibleProjection?.meals.state === "loaded"
      ? visibleProjection.meals.value.items
      : [];
  const nutritionLogs =
    visibleProjection?.nutrition.logs.state === "loaded"
      ? visibleProjection.nutrition.logs.value
      : null;
  const nutritionTargets =
    visibleProjection?.nutrition.targets.state === "loaded"
      ? visibleProjection.nutrition.targets.value
      : null;
  const totals =
    nutritionLogs
      ? {
          calories: nutritionLogs.totals.calories,
          protein_g: nutritionLogs.totals.proteinG,
          carbs_g: nutritionLogs.totals.carbsG,
          fat_g: nutritionLogs.totals.fatG,
        }
      : null;
  const targets: SavedTargets | null =
    nutritionTargets?.hasTarget &&
    nutritionTargets.dailyCalories !== null &&
    nutritionTargets.proteinG !== null &&
    nutritionTargets.carbsG !== null &&
    nutritionTargets.fatG !== null &&
    nutritionTargets.waterMl !== null
      ? {
          daily_calories: nutritionTargets.dailyCalories,
          protein_g: nutritionTargets.proteinG,
          carbs_g: nutritionTargets.carbsG,
          fat_g: nutritionTargets.fatG,
          water_ml: nutritionTargets.waterMl,
        }
      : null;
  const remaining = useDashboardRemainingMacros(targets, totals);
  const foodLogCount = nutritionLogs?.foodLogCount ?? null;
  const waterTotal =
    visibleProjection?.hydration.state === "loaded"
      ? visibleProjection.hydration.value.totalMl
      : null;
  const groceryItems =
    visibleProjection?.shopping.state === "loaded"
      ? visibleProjection.shopping.value.items
      : [];
  const relevantMeal = selectRelevantMeal(meals, localHour);
  const unbought = groceryItems.filter(
    (item) => !item.checked && !item.alreadyHave,
  );
  const bought = groceryItems.filter((item) => item.checked);
  const alreadyHave = groceryItems.filter((item) => item.alreadyHave);

  const publishedDashboardContext = useMemo<QuickPromptContext>(() => {
    const source = visibleProjection?.promptContext;
    return {
      route: "/dashboard",
      today,
      localHour,
      units: {
        energy: settings.energyUnit,
        liquid: settings.liquidUnit,
        weight: settings.weightUnit,
      },
      workout: source
        ? {
            hasPlan: source.workout.hasPlan ?? undefined,
            scheduled: source.workout.scheduled,
            active: source.workout.active,
            completed: source.workout.completed,
            skipped: source.workout.skipped,
            title: source.workout.title,
            exerciseCount: source.workout.exerciseCount,
            durationMinutes: source.workout.durationMinutes,
            historyCount: source.workout.historyCount,
          }
        : undefined,
      nutrition: source
        ? {
            hasTargets: source.nutrition.hasTargets,
            targetsState: source.nutrition.targetsState,
            foodLogsState: source.nutrition.foodLogsState,
            remainingCalories: source.nutrition.remainingCalories,
            remainingProtein: source.nutrition.remainingProtein,
            remainingCarbs: source.nutrition.remainingCarbs,
            remainingFat: source.nutrition.remainingFat,
            foodLogCount: source.nutrition.foodLogCount,
            mealPlanCount: source.nutrition.mealPlanCount,
            plannedMealCount: source.nutrition.plannedMealCount,
          }
        : undefined,
      grocery: source?.grocery,
      hydration: source?.hydration,
      recovery: source?.recovery,
      wellness: source?.wellness,
      progress: source?.progress,
      profile: source?.profile,
      endOfWeek: source?.endOfWeek,
    };
  }, [
    localHour,
    settings.energyUnit,
    settings.liquidUnit,
    settings.weightUnit,
    today,
    visibleProjection?.promptContext,
  ]);
  useDashboardContextPublication(
    publishedDashboardContext,
    setDashboardContext,
  );

  const publishMutation = useCallback(
    (
      operationKey: string,
      generation: number,
      transform: (current: TodayProjectionResponseV1) => TodayProjectionResponseV1,
    ) => {
      if (!operationIsCurrent(operationKey, generation)) return false;
      const current = projectionRef.current;
      if (!current || authorityRef.current.resolvedKey !== operationKey) return false;
      const next = transform(current);
      projectionRef.current = next;
      setProjection(next);
      return true;
    },
    [operationIsCurrent],
  );

  async function markMealDone(item: TodayMealPlanItemProjection) {
    if (!userId || pendingMealIds.has(item.id) || item.status !== "planned") return;
    const operationKey = currentRequestKey;
    const generation = authorityRef.current.generation;
    setPendingMealIds((current) => new Set(current).add(item.id));
    try {
      const result = await markTodayMealDone(userId, item.id);
      let needsRefresh = false;
      publishMutation(operationKey, generation, (current) => {
        const applied = applyMealCompletion(current, result);
        needsRefresh = applied.needsRefresh;
        return applied.projection;
      });
      if (operationIsCurrent(operationKey, generation)) {
        if (needsRefresh) void retryProjection();
        setFeedback(copy.mealSaved);
      }
    } catch (error) {
      if (operationIsCurrent(operationKey, generation)) {
        toast({
          title: copy.mealDoneFailed,
          description: userSafeError(error),
          variant: "error",
        });
      }
    } finally {
      setPendingMealIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function skipMealItems(items: TodayMealPlanItemProjection[]) {
    if (
      !userId ||
      !items.length ||
      items.some((item) => pendingMealIds.has(item.id))
    ) {
      return;
    }
    const operationKey = currentRequestKey;
    const generation = authorityRef.current.generation;
    const ids = new Set(items.map((item) => item.id));
    const previousById = new Map(items.map((item) => [item.id, item]));
    setPendingMealIds((current) => new Set([...current, ...ids]));
    publishMutation(operationKey, generation, (current) =>
      updateMealProjection(
        current,
        current.meals.state === "loaded"
          ? current.meals.value.items.map((item) =>
              ids.has(item.id) ? { ...item, status: "skipped" } : item,
            )
          : [],
      ),
    );
    try {
      const saved =
        items.length === 1
          ? [await markTodayMealSkipped(userId, items[0].id)]
          : await markTodayMealsSkipped(
              userId,
              items.map((item) => item.id),
            );
      if (
        publishMutation(operationKey, generation, (current) =>
          reconcileSkippedMealItems(current, previousById, saved)
        )
      ) {
        setFeedback(copy.mealSkipped);
      }
    } catch (error) {
      if (operationIsCurrent(operationKey, generation)) {
        publishMutation(operationKey, generation, (current) =>
          restoreOptimisticMealItems(current, previousById)
        );
        toast({
          title: copy.mealSkipFailed,
          description: userSafeError(error),
          variant: "error",
        });
      }
    } finally {
      setPendingMealIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  async function toggleBought(item: TodayShoppingItemProjection) {
    if (!userId || pendingGroceryIds.has(item.id)) return;
    const operationKey = currentRequestKey;
    const generation = authorityRef.current.generation;
    const previousChecked = item.checked;
    const optimisticChecked = !item.checked;
    setPendingGroceryIds((current) => new Set(current).add(item.id));
    publishMutation(operationKey, generation, (current) => {
      if (current.shopping.state !== "loaded") return current;
      const items = current.shopping.value.items.map((value) =>
        value.id === item.id ? { ...value, checked: optimisticChecked } : value,
      );
      return {
        ...current,
        shopping: {
          state: "loaded",
          errorCode: null,
          value: { items, itemCount: items.length },
        },
      };
    });
    try {
      const saved = await toggleTodayShoppingItem(userId, item);
      publishMutation(operationKey, generation, (current) => {
        if (current.shopping.state !== "loaded") return current;
        const items = current.shopping.value.items.map((value) =>
          value.id === item.id ? saved : value,
        );
        return {
          ...current,
          shopping: {
            state: "loaded",
            errorCode: null,
            value: { items, itemCount: items.length },
          },
        };
      });
    } catch (error) {
      if (operationIsCurrent(operationKey, generation)) {
        publishMutation(operationKey, generation, (current) => {
          if (current.shopping.state !== "loaded") return current;
          const items = current.shopping.value.items.map((value) =>
            value.id === item.id && value.checked === optimisticChecked
              ? { ...value, checked: previousChecked }
              : value,
          );
          return {
            ...current,
            shopping: {
              state: "loaded",
              errorCode: null,
              value: { items, itemCount: items.length },
            },
          };
        });
        toast({
          title: copy.groceryUpdateFailed,
          description: userSafeError(error),
          variant: "error",
        });
      }
    } finally {
      setPendingGroceryIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  const localizedDate = new Intl.DateTimeFormat(
    language === "de" ? "de-DE" : language === "ar" ? "ar-EG" : "en-GB",
    { weekday: "long", day: "numeric", month: "long" },
  ).format(new Date(`${today}T12:00:00`));
  const headingWorkoutStatus =
    workoutState === "loaded"
      ? workout?.dayId
        ? copy.trainingDay
        : copy.restDay
      : workoutState === "failed"
        ? copy.unavailable
        : copy.loading;

  return (
    <div dir={dir} data-today-refreshing={isRefreshing || undefined}>
      <PageHeading
        title={`${copy.today}${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description={`${localizedDate} · ${headingWorkoutStatus}`}
        action={
          <Button
            type="button"
            className="min-h-12"
            onClick={() => openPrompts()}
          >
            <OpenAiBlossom className="h-5 w-5" />
            {copy.askChatGpt}
          </Button>
        }
      />
      <div className="space-y-4">
        <TodayProgress
          totals={totals}
          foodLogCount={foodLogCount}
          logsState={progressSourceState(logsState)}
          targets={targets}
          targetsState={progressSourceState(targetsState)}
          waterTotal={waterTotal}
          hydrationState={progressSourceState(hydrationState)}
          energyUnit={settings.energyUnit}
          liquidUnit={settings.liquidUnit}
          remainingCalculated={remaining !== null}
          copy={copy}
        />
        {logsState === "failed" ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-warning/30 bg-warning/5 p-3"
            role="alert"
          >
            <p className="text-sm text-muted-foreground">
              {copy.sectionUnavailable}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void retryProjection()}
            >
              {copy.retry}
            </Button>
          </div>
        ) : null}

        <section aria-labelledby="today-plan">
          <h2 id="today-plan" className="mb-2 text-base font-semibold">
            {copy.todayPlan}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Dumbbell className="h-5 w-5" />
                  {copy.todaysWorkout}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {workoutState === "loading" || workoutState === "idle" ? (
                  <p className="text-sm text-muted-foreground">{copy.loading}</p>
                ) : null}
                {workoutState === "failed" ? (
                  <SectionFailure
                    message={copy.sectionUnavailable}
                    copy={copy}
                    onRetry={() => void retryProjection()}
                  />
                ) : null}
                {workoutState === "loaded" && workout?.dayId ? (
                  <>
                    <div>
                      <p className="font-semibold">{workout.dayName}</p>
                      <p className="text-sm text-muted-foreground">
                        {interpolateFocusedTodayCopy(copy.exercisesCount, {
                          count: workout.exerciseCount ?? 0,
                        })}
                        {workout.sessionDurationMinutes
                          ? ` · ${interpolateFocusedTodayCopy(copy.durationMinutes, {
                              minutes: workout.sessionDurationMinutes,
                            })}`
                          : ""}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {workout.previewExercises.map((exercise) => (
                        <p
                          key={exercise.id}
                          className="text-sm text-muted-foreground"
                        >
                          {exercise.sets ?? 1} × {exercise.reps ?? "?"}{" "}
                          {exercise.name}
                        </p>
                      ))}
                    </div>
                    {workout.actionHref ? (
                      <Button asChild variant="outline" className="min-h-11">
                        <Link href={workout.actionHref}>
                          {workout.state === "active"
                            ? copy.resumeWorkout
                            : workout.state === "completed"
                              ? copy.viewWorkout
                              : copy.startWorkout}
                        </Link>
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {workoutState === "loaded" && !workout?.dayId ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {copy.noWorkoutScheduled}
                    </p>
                    <Button asChild className="min-h-11">
                      <Link href="/my-workout/plans">{copy.openTrain}</Link>
                    </Button>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Utensils className="h-5 w-5" />
                  {copy.todaysMeals}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mealsState === "loading" || mealsState === "idle" ? (
                  <p className="text-sm text-muted-foreground">{copy.loading}</p>
                ) : null}
                {mealsState === "failed" ? (
                  <SectionFailure
                    message={copy.sectionUnavailable}
                    copy={copy}
                    onRetry={() => void retryProjection()}
                  />
                ) : null}
                {mealsState === "loaded" && relevantMeal ? (
                  <>
                    <div>
                      <p className="font-semibold">
                        {mealTypeLabel(relevantMeal.mealSlotKey, copy)}:{" "}
                        {relevantMeal.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {relevantMeal.calories === null
                          ? "—"
                          : Math.round(relevantMeal.calories)}{" "}
                        kcal ·{" "}
                        {relevantMeal.proteinG === null
                          ? "—"
                          : Math.round(relevantMeal.proteinG)}{" "}
                        g {copy.protein}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => void markMealDone(relevantMeal)}
                        disabled={pendingMealIds.has(relevantMeal.id)}
                        className="min-h-11"
                      >
                        <Check className="h-4 w-4" />
                        {pendingMealIds.has(relevantMeal.id)
                          ? copy.saving
                          : copy.markDone}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void skipMealItems([relevantMeal])}
                        disabled={pendingMealIds.has(relevantMeal.id)}
                        className="min-h-11"
                      >
                        {copy.skip}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          void skipMealItems(
                            meals.filter((item) => item.status === "planned"),
                          )
                        }
                        disabled={!meals.some((item) => item.status === "planned")}
                        className="min-h-11"
                      >
                        {copy.skipAll}
                      </Button>
                    </div>
                  </>
                ) : null}
                {mealsState === "loaded" && !relevantMeal ? (
                  <p className="text-sm text-muted-foreground">
                    {meals.some((item) => item.status === "skipped")
                      ? copy.skipped
                      : copy.noMealsPlanned}
                  </p>
                ) : null}
                {mealsState === "loaded" ? (
                  <Button asChild variant="outline" className="min-h-11">
                    <Link href={`/my-meal-plan?date=${today}`}>
                      {copy.openMealPlan}
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <InlineFeedback message={feedback} onClose={() => setFeedback("")} />

        <WellnessToday
          state={wellnessState}
          habits={visibleProjection?.wellness.habits ?? null}
          supplements={visibleProjection?.wellness.supplements ?? null}
          sleep={visibleProjection?.wellness.sleep ?? null}
          copy={copy}
        />

        {shoppingState === "failed" ? (
          <section aria-labelledby="shopping-failed">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h2 id="shopping-failed" className="font-semibold">
                    {copy.shoppingList}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {copy.sectionUnavailable}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void retryProjection()}
                >
                  {copy.retry}
                </Button>
              </CardContent>
            </Card>
          </section>
        ) : null}
        {shoppingState === "loaded" && groceryItems.length ? (
          <section
            aria-labelledby="shopping-list"
            className="lg:max-w-[calc(50%-0.5rem)]"
          >
            <Card>
              <CardHeader>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 text-start"
                  aria-expanded={shoppingExpanded}
                  onClick={() => setShoppingExpanded((value) => !value)}
                >
                  <span>
                    <CardTitle
                      id="shopping-list"
                      className="flex items-center gap-2 text-base"
                    >
                      <ShoppingCart className="h-5 w-5" />
                      {copy.shoppingList}
                    </CardTitle>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {unbought.length} {copy.remaining} · {bought.length}{" "}
                      {copy.bought}
                      {alreadyHave.length
                        ? ` · ${alreadyHave.length} ${copy.alreadyHave}`
                        : ""}
                    </span>
                  </span>
                  {shoppingExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </button>
              </CardHeader>
              {shoppingExpanded ? (
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {unbought.slice(0, 6).map((item) => (
                      <label
                        key={item.id}
                        className="flex min-h-12 items-center gap-3 rounded-[12px] border border-border/70 px-3"
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={pendingGroceryIds.has(item.id)}
                          onChange={() => void toggleBought(item)}
                          className="h-5 w-5 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {item.itemName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.quantity ?? ""} {item.unit ?? ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {bought.length ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setBoughtExpanded((value) => !value)}
                        className="flex min-h-11 items-center gap-2 text-sm font-semibold"
                        aria-expanded={boughtExpanded}
                      >
                        {copy.boughtItems}
                        {boughtExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                      {boughtExpanded ? (
                        <div className="space-y-2">
                          {bought.map((item) => (
                            <label
                              key={item.id}
                              className="flex min-h-11 items-center gap-3 rounded-[12px] border border-border/70 px-3 opacity-75"
                            >
                              <input
                                type="checkbox"
                                checked
                                disabled={pendingGroceryIds.has(item.id)}
                                onChange={() => void toggleBought(item)}
                                className="h-5 w-5 accent-primary"
                              />
                              <span className="line-through">{item.itemName}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <Button asChild variant="outline" className="min-h-11">
                    <Link href={`/my-meal-plan/shopping?date=${today}`}>
                      {copy.openFullGrocery}
                    </Link>
                  </Button>
                </CardContent>
              ) : null}
            </Card>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SectionFailure({
  message,
  copy,
  onRetry,
}: {
  message: string;
  copy: ReturnType<typeof getFocusedTodayCopy>;
  onRetry: () => void;
}) {
  return (
    <div role="alert">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-3 min-h-11"
        onClick={onRetry}
      >
        {copy.retry}
      </Button>
    </div>
  );
}
