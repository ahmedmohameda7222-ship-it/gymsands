"use client";

import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Dumbbell, ShoppingCart, Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { PageHeading } from "@/components/layout/page-heading";
import { TodayProgress } from "@/components/dashboard/today-progress";
import { WellnessToday } from "@/components/dashboard/wellness-today";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { InlineFeedback } from "@/components/motion";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getFocusedTodayCopy, interpolateFocusedTodayCopy } from "@/lib/dashboard/focused-today-copy";
import { resolveTodayWorkout, selectRelevantMeal, todayWorkoutActionHref } from "@/lib/dashboard/today-model";
import {
  dashboardRequestKey,
  dashboardSourceStates,
  dashboardValueForRequest,
  isDashboardRequestCurrent,
  type DashboardSourceName,
  type DashboardSourceState,
  type DashboardSourceStates
} from "@/lib/dashboard/today-request";
import { remainingMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import { startOfWeek } from "@/services/reports/reporting";
import { getMealPlanItemsForDate, markDirectMealPlanItemDone, markDirectMealPlanItemSkipped, markDirectMealPlanItemsSkipped } from "@/services/database/meal-plan";
import { getGroceryItems, upsertGroceryItem } from "@/services/database/execution-layer";
import { getFitnessHabits, getSupplementLogs } from "@/services/database/wellness";
import {
  getDashboardProfileContext,
  getDashboardProgressContext,
  getDashboardSleepRecoveryLogs,
  getDashboardWaterLogs,
  getDashboardWorkoutData,
  initialDashboardProfileContext,
  initialDashboardProgressContext,
  resolveDashboardWellnessResults,
  type DashboardProfileContext,
  type DashboardProgressContext,
  type DashboardWellnessData,
  type DashboardWorkoutData
} from "@/services/database/dashboard-today-sources";
import {
  getTodayNutritionData,
  getTodayNutritionTargetData,
  subscribeToTodayNutritionTargetChanges
} from "@/services/database/today-nutrition";
import { logRecoverableError, userSafeError } from "@/lib/error-formatting";
import {
  initialTodayNutritionData,
  knownFoodLogCount,
  upsertFoodLogById,
  type TodayNutritionData,
  type TodayNutritionTargetData
} from "@/lib/dashboard/today-nutrition";
import type { MealPlanItem, UserGroceryItem, WaterLog } from "@/types";

const initialWorkout: DashboardWorkoutData = { plan: null, day: null, sessions: [], openSessionId: null };
const initialWellness: DashboardWellnessData = { habits: [], supplements: [], sleepLogs: [], errors: {} };
type SourceErrors = Partial<Record<DashboardSourceName, string>>;
type TargetLoadCache = { key: string; promise: Promise<TodayNutritionTargetData> } | null;

function mealTypeLabel(value: string | undefined, copy: ReturnType<typeof getFocusedTodayCopy>) {
  if (value === "Breakfast") return copy.breakfast;
  if (value === "Lunch") return copy.lunch;
  if (value === "Dinner") return copy.dinner;
  return copy.snack;
}

function progressSourceState(state: DashboardSourceState): "loading" | "loaded" | "failed" {
  return state === "failed" ? "failed" : state === "loaded" ? "loaded" : "loading";
}

export function TodayDashboard() {
  const { user, profile } = useAuth();
  const { language, dir } = useTranslation();
  const { settings } = useUserSettings();
  const copy = getFocusedTodayCopy(language);
  const { toast } = useToast();
  const { openPrompts, setDashboardContext } = useQuickChatGpt();
  const today = useTodayDate();
  const currentRequestKey = dashboardRequestKey(user?.id, today);

  const [activeRequestKey, setActiveRequestKey] = useState(currentRequestKey);
  const activeRequestKeyRef = useRef(currentRequestKey);
  const [states, setStates] = useState<DashboardSourceStates>(dashboardSourceStates("idle"));
  const [errors, setErrors] = useState<SourceErrors>({});
  const [workoutData, setWorkoutData] = useState<DashboardWorkoutData>(initialWorkout);
  const [mealItems, setMealItems] = useState<MealPlanItem[]>([]);
  const [nutritionData, setNutritionData] = useState<TodayNutritionData>(initialTodayNutritionData);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [groceryItems, setGroceryItems] = useState<UserGroceryItem[]>([]);
  const [wellnessData, setWellnessData] = useState<DashboardWellnessData>(initialWellness);
  const [profileContext, setProfileContext] = useState<DashboardProfileContext>(initialDashboardProfileContext);
  const [progressContext, setProgressContext] = useState<DashboardProgressContext>(initialDashboardProgressContext);
  const [shoppingExpanded, setShoppingExpanded] = useState(false);
  const [boughtExpanded, setBoughtExpanded] = useState(false);
  const [pendingMealIds, setPendingMealIds] = useState<Set<string>>(new Set());
  const [pendingGroceryIds, setPendingGroceryIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [reload, setReload] = useState(0);
  const requestVersion = useRef(0);
  const targetLoadRef = useRef<TargetLoadCache>(null);

  const requestIsCurrent = activeRequestKey === currentRequestKey;
  const visibleStates = requestIsCurrent ? states : dashboardSourceStates("loading");
  const visibleWorkoutData = dashboardValueForRequest({ activeKey: activeRequestKey, currentKey: currentRequestKey, value: workoutData, fallback: initialWorkout });
  const visibleMealItems = dashboardValueForRequest({ activeKey: activeRequestKey, currentKey: currentRequestKey, value: mealItems, fallback: [] as MealPlanItem[] });
  const visibleNutritionData = dashboardValueForRequest({ activeKey: activeRequestKey, currentKey: currentRequestKey, value: nutritionData, fallback: initialTodayNutritionData });
  const visibleWaterLogs = dashboardValueForRequest({ activeKey: activeRequestKey, currentKey: currentRequestKey, value: waterLogs, fallback: [] as WaterLog[] });
  const visibleGroceryItems = dashboardValueForRequest({ activeKey: activeRequestKey, currentKey: currentRequestKey, value: groceryItems, fallback: [] as UserGroceryItem[] });
  const visibleWellnessData = dashboardValueForRequest({ activeKey: activeRequestKey, currentKey: currentRequestKey, value: wellnessData, fallback: initialWellness });
  const visibleProfileContext = dashboardValueForRequest({ activeKey: activeRequestKey, currentKey: currentRequestKey, value: profileContext, fallback: initialDashboardProfileContext });
  const visibleProgressContext = dashboardValueForRequest({ activeKey: activeRequestKey, currentKey: currentRequestKey, value: progressContext, fallback: initialDashboardProgressContext });

  const isCurrentOperation = useCallback((requestKey: string, version: number) => isDashboardRequestCurrent({
    activeVersion: requestVersion.current,
    requestVersion: version,
    activeKey: activeRequestKeyRef.current,
    requestKey
  }), []);

  const setSource = useCallback((source: DashboardSourceName, state: DashboardSourceState, error?: string) => {
    setStates((current) => ({ ...current, [source]: state }));
    setErrors((current) => ({ ...current, [source]: error }));
  }, []);

  const loadTodayTargetOnce = useCallback(() => {
    if (!user?.id) return Promise.reject(new Error("A signed-in user is required."));
    const key = dashboardRequestKey(user.id, today);
    if (targetLoadRef.current?.key === key) return targetLoadRef.current.promise;
    const request = getTodayNutritionTargetData(user.id, today).finally(() => {
      if (targetLoadRef.current?.key === key && targetLoadRef.current.promise === request) targetLoadRef.current = null;
    });
    targetLoadRef.current = { key, promise: request };
    return request;
  }, [today, user?.id]);

  useEffect(() => {
    const version = ++requestVersion.current;
    const requestKey = dashboardRequestKey(user?.id, today);
    activeRequestKeyRef.current = requestKey;
    setActiveRequestKey(requestKey);
    setStates(user?.id ? dashboardSourceStates("loading") : dashboardSourceStates("idle"));
    setErrors({});
    setWorkoutData(initialWorkout);
    setMealItems([]);
    setNutritionData(initialTodayNutritionData);
    setWaterLogs([]);
    setGroceryItems([]);
    setWellnessData(initialWellness);
    setProfileContext(initialDashboardProfileContext);
    setProgressContext(initialDashboardProgressContext);
    setShoppingExpanded(false);
    setBoughtExpanded(false);
    setPendingMealIds(new Set());
    setPendingGroceryIds(new Set());
    setFeedback("");

    if (!user?.id) return;
    const userId = user.id;

    const run = async <T,>(source: DashboardSourceName, loader: () => Promise<T>, apply: (value: T) => void) => {
      try {
        const value = await loader();
        if (!isCurrentOperation(requestKey, version)) return;
        apply(value);
        setSource(source, "loaded");
      } catch (error) {
        if (!isCurrentOperation(requestKey, version)) return;
        logRecoverableError(`today.${source}`, error);
        setSource(source, "failed", userSafeError(error, copy.sectionUnavailable));
      }
    };

    const runContext = async <T,>(loader: () => Promise<T>, apply: (value: T) => void, fail: () => void) => {
      try {
        const value = await loader();
        if (isCurrentOperation(requestKey, version)) apply(value);
      } catch (error) {
        if (!isCurrentOperation(requestKey, version)) return;
        logRecoverableError("today.prompt-context", error);
        fail();
      }
    };

    void run("workout", () => getDashboardWorkoutData(userId, today), setWorkoutData);
    void run("meals", () => getMealPlanItemsForDate(userId, today), setMealItems);
    void run("nutrition", () => getTodayNutritionData(userId, today, {
      loadLogs: (id, date) => import("@/services/database/nutrition").then(({ getTodayFoodLogs }) => getTodayFoodLogs(id, date, { throwOnError: true })),
      loadTargetData: () => loadTodayTargetOnce()
    }), setNutritionData);
    void run("hydration", () => getDashboardWaterLogs(userId, today), setWaterLogs);
    void run("shopping", () => getGroceryItems(userId, startOfWeek(today)), setGroceryItems);
    void run("wellness", async () => {
      const [habits, supplements, sleep] = await Promise.allSettled([
        getFitnessHabits(userId, today, { throwOnError: true }),
        getSupplementLogs(userId, today, { throwOnError: true }),
        getDashboardSleepRecoveryLogs(userId, 7)
      ]);
      if ([habits, supplements, sleep].every((result) => result.status === "rejected")) throw new Error(copy.sectionUnavailable);
      return resolveDashboardWellnessResults({ habits, supplements, sleep, unavailableMessage: copy.sectionUnavailable });
    }, setWellnessData);

    void runContext(
      () => getDashboardProfileContext(userId),
      setProfileContext,
      () => setProfileContext({ ...initialDashboardProfileContext, state: "failed" })
    );
    void runContext(
      () => getDashboardProgressContext(userId),
      setProgressContext,
      () => setProgressContext({ state: "failed", entryCount: null })
    );

    return () => {
      if (isCurrentOperation(requestKey, version)) requestVersion.current += 1;
    };
  }, [copy.sectionUnavailable, isCurrentOperation, loadTodayTargetOnce, reload, setSource, today, user?.id]);

  const retryFoodLogs = useCallback(async () => {
    if (!user?.id) return false;
    const requestKey = dashboardRequestKey(user.id, today);
    const version = requestVersion.current;
    setNutritionData((current) => ({ ...current, logsState: "loading", logsError: null }));
    try {
      const { getTodayFoodLogs } = await import("@/services/database/nutrition");
      const logs = await getTodayFoodLogs(user.id, today, { throwOnError: true });
      if (!isCurrentOperation(requestKey, version)) return false;
      setNutritionData((current) => ({ ...current, logs, logsState: "loaded", logsError: null, totalsIncomplete: false }));
      return true;
    } catch (error) {
      if (!isCurrentOperation(requestKey, version)) return false;
      setNutritionData((current) => ({ ...current, logs: null, logsState: "failed", logsError: userSafeError(error, copy.unavailable), totalsIncomplete: current.totalsIncomplete }));
      return false;
    }
  }, [copy.unavailable, isCurrentOperation, today, user?.id]);

  const retryNutritionTarget = useCallback(async () => {
    if (!user?.id) return false;
    const requestKey = dashboardRequestKey(user.id, today);
    const version = requestVersion.current;
    setNutritionData((current) => ({ ...current, targetsState: "loading", targetsError: null }));
    try {
      const result = await loadTodayTargetOnce();
      if (!isCurrentOperation(requestKey, version)) return false;
      setNutritionData((current) => ({ ...current, targets: result.targets, activeTarget: result.activeTarget, targetsState: "loaded", targetsError: null }));
      return true;
    } catch (error) {
      if (!isCurrentOperation(requestKey, version)) return false;
      setNutritionData((current) => ({ ...current, targets: null, activeTarget: null, targetsState: "failed", targetsError: userSafeError(error, copy.targetUnavailable) }));
      return false;
    }
  }, [copy.targetUnavailable, isCurrentOperation, loadTodayTargetOnce, today, user?.id]);

  useEffect(() => subscribeToTodayNutritionTargetChanges(window, today, () => { void retryNutritionTarget(); }), [retryNutritionTarget, today]);

  const totals = useMemo(() => visibleNutritionData.logs ? sumFoodLogs(visibleNutritionData.logs) : null, [visibleNutritionData.logs]);
  const targets = visibleNutritionData.targets;
  const remaining = targets && totals ? remainingMacros({ calories: targets.daily_calories, protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g, water_ml: targets.water_ml }, totals) : null;
  const waterTotal = useMemo(() => visibleWaterLogs.reduce((sum, item) => sum + Number(item.amount_ml), 0), [visibleWaterLogs]);
  const workoutResolution = resolveTodayWorkout({ today, planDayId: visibleWorkoutData.day?.id ?? null, openSessionId: visibleWorkoutData.openSessionId, sessions: visibleWorkoutData.sessions });
  const workoutState = workoutResolution.state;
  const workoutCardHref = todayWorkoutActionHref(workoutResolution, visibleWorkoutData.day?.id ?? null);
  const relevantMeal = selectRelevantMeal(visibleMealItems);
  const todaySleep = visibleWellnessData.sleepLogs.find((item) => item.log_date === today) ?? visibleWellnessData.sleepLogs[0] ?? null;
  const unbought = visibleGroceryItems.filter((item) => !item.checked && !item.already_have);
  const bought = visibleGroceryItems.filter((item) => item.checked);
  const alreadyHave = visibleGroceryItems.filter((item) => item.already_have);

  useEffect(() => {
    const normalize = (state: DashboardSourceState) => state === "idle" ? "unknown" : state;
    const workoutLoaded = visibleStates.workout === "loaded";
    setDashboardContext({
      route: "/dashboard",
      today,
      localHour: new Date().getHours(),
      units: { energy: settings.energyUnit, liquid: settings.liquidUnit, weight: settings.weightUnit },
      profile: visibleProfileContext,
      progress: visibleProgressContext,
      workout: {
        hasPlan: workoutLoaded ? Boolean(visibleWorkoutData.plan) : undefined,
        scheduled: workoutLoaded ? workoutState === "scheduled" : false,
        active: workoutLoaded ? workoutState === "active" : false,
        completed: workoutLoaded ? workoutState === "completed" : false,
        title: workoutLoaded ? visibleWorkoutData.day?.day_name ?? null : null,
        exerciseCount: workoutLoaded ? visibleWorkoutData.day?.exercises.length ?? null : null,
        durationMinutes: workoutLoaded ? visibleWorkoutData.plan?.session_duration_minutes ?? null : null,
        historyCount: workoutLoaded ? visibleWorkoutData.sessions.filter((session) => session.status === "completed").length : null
      },
      nutrition: {
        hasTargets: Boolean(targets),
        targetsState: visibleNutritionData.targetsState,
        foodLogsState: visibleNutritionData.logsState,
        remainingCalories: remaining?.calories ?? null,
        remainingProtein: remaining?.protein_g ?? null,
        remainingCarbs: remaining?.carbs_g ?? null,
        remainingFat: remaining?.fat_g ?? null,
        foodLogCount: knownFoodLogCount(visibleNutritionData),
        mealPlanCount: visibleStates.meals === "loaded" ? visibleMealItems.length : null,
        plannedMealCount: visibleStates.meals === "loaded" ? visibleMealItems.filter((item) => item.status === "planned").length : null
      },
      grocery: { state: normalize(visibleStates.shopping), itemCount: visibleStates.shopping === "loaded" ? visibleGroceryItems.length : null },
      hydration: { state: normalize(visibleStates.hydration), hasTarget: Boolean(targets?.water_ml), logCount: visibleStates.hydration === "loaded" ? visibleWaterLogs.length : null, remainingMl: visibleStates.hydration === "loaded" && targets?.water_ml ? Math.max(0, targets.water_ml - waterTotal) : null },
      recovery: { state: normalize(visibleStates.wellness), hasData: Boolean(todaySleep), sleepHours: todaySleep?.hours_slept ?? null, poorRecovery: Boolean(todaySleep && (todaySleep.recovery_level === "low" || todaySleep.fatigue_level === "high")) },
      wellness: { state: normalize(visibleStates.wellness), habitCount: visibleStates.wellness === "loaded" ? visibleWellnessData.habits.length : null, supplementCount: visibleStates.wellness === "loaded" ? visibleWellnessData.supplements.length : null },
      endOfWeek: new Date(`${today}T12:00:00`).getDay() === 0
    });
  }, [remaining, setDashboardContext, settings.energyUnit, settings.liquidUnit, settings.weightUnit, targets, today, todaySleep, visibleGroceryItems.length, visibleMealItems, visibleNutritionData, visibleProfileContext, visibleProgressContext, visibleStates, visibleWaterLogs.length, visibleWellnessData.habits.length, visibleWellnessData.supplements.length, visibleWorkoutData, waterTotal, workoutState]);

  async function markMealDone(item: MealPlanItem) {
    if (pendingMealIds.has(item.id) || item.status !== "planned") return;
    const operationKey = currentRequestKey;
    const version = requestVersion.current;
    setPendingMealIds((current) => new Set(current).add(item.id));
    try {
      const result = await markDirectMealPlanItemDone(item);
      if (!isCurrentOperation(operationKey, version)) return;
      setMealItems((current) => current.map((value) => value.id === item.id ? result.item : value));
      if (result.log && visibleNutritionData.logsState === "loaded" && visibleNutritionData.logs) {
        setNutritionData((current) => ({ ...current, logs: current.logs ? upsertFoodLogById(current.logs, result.log) : null }));
      } else if (result.log) {
        setNutritionData((current) => ({ ...current, totalsIncomplete: true }));
        await retryFoodLogs();
      }
      setFeedback(copy.mealSaved);
    } catch (error) {
      if (isCurrentOperation(operationKey, version)) toast({ title: copy.mealDoneFailed, description: userSafeError(error), variant: "error" });
    } finally {
      setPendingMealIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
    }
  }

  async function skipMealItems(items: MealPlanItem[]) {
    if (!user?.id || !items.length || items.some((item) => pendingMealIds.has(item.id))) return;
    const operationKey = currentRequestKey;
    const version = requestVersion.current;
    const previous = mealItems;
    const ids = new Set(items.map((item) => item.id));
    setPendingMealIds((current) => new Set([...current, ...ids]));
    setMealItems((current) => current.map((item) => ids.has(item.id) ? { ...item, status: "skipped" } : item));
    try {
      const saved = items.length === 1 ? [await markDirectMealPlanItemSkipped(items[0])] : await markDirectMealPlanItemsSkipped(user.id, items.map((item) => item.id));
      if (!isCurrentOperation(operationKey, version)) return;
      const byId = new Map(saved.map((item) => [item.id, item]));
      setMealItems((current) => current.map((item) => byId.get(item.id) ?? item));
      setFeedback(copy.mealSkipped);
    } catch (error) {
      if (isCurrentOperation(operationKey, version)) {
        setMealItems(previous);
        toast({ title: copy.mealSkipFailed, description: userSafeError(error), variant: "error" });
      }
    } finally {
      setPendingMealIds((current) => { const next = new Set(current); ids.forEach((id) => next.delete(id)); return next; });
    }
  }

  async function toggleBought(item: UserGroceryItem) {
    if (!user?.id || pendingGroceryIds.has(item.id)) return;
    const operationKey = currentRequestKey;
    const version = requestVersion.current;
    const previous = groceryItems;
    setPendingGroceryIds((current) => new Set(current).add(item.id));
    setGroceryItems((current) => current.map((value) => value.id === item.id ? { ...value, checked: !item.checked } : value));
    try {
      const saved = await upsertGroceryItem(user.id, { ...item, checked: !item.checked });
      if (isCurrentOperation(operationKey, version)) setGroceryItems((current) => current.map((value) => value.id === item.id ? saved : value));
    } catch (error) {
      if (isCurrentOperation(operationKey, version)) {
        setGroceryItems(previous);
        toast({ title: copy.groceryUpdateFailed, description: userSafeError(error), variant: "error" });
      }
    } finally {
      setPendingGroceryIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
    }
  }

  const localizedDate = new Intl.DateTimeFormat(language === "de" ? "de-DE" : language === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${today}T12:00:00`));
  const headingWorkoutStatus = visibleStates.workout === "loaded"
    ? visibleWorkoutData.day ? copy.trainingDay : copy.restDay
    : visibleStates.workout === "failed" ? copy.unavailable : copy.loading;

  return (
    <div dir={dir}>
      <PageHeading
        title={`${copy.today}${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description={`${localizedDate} · ${headingWorkoutStatus}`}
        action={<Button type="button" className="min-h-12" onClick={() => openPrompts()}><OpenAiBlossom className="h-5 w-5" />{copy.askChatGpt}</Button>}
      />
      <div className="space-y-4">
        <TodayProgress
          totals={totals}
          logsState={visibleNutritionData.logsState}
          targets={targets}
          targetsState={visibleNutritionData.targetsState}
          waterTotal={visibleStates.hydration === "loaded" ? waterTotal : null}
          hydrationState={progressSourceState(visibleStates.hydration)}
          energyUnit={settings.energyUnit}
          liquidUnit={settings.liquidUnit}
          copy={copy}
        />
        {visibleNutritionData.logsState === "failed" || visibleNutritionData.totalsIncomplete ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-warning/30 bg-warning/5 p-3" role="alert">
            <p className="text-sm text-muted-foreground">{copy.sectionUnavailable}</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void retryFoodLogs()}>{copy.retry}</Button>
          </div>
        ) : null}

        <section aria-labelledby="today-plan">
          <h2 id="today-plan" className="mb-2 text-base font-semibold">{copy.todayPlan}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Dumbbell className="h-5 w-5" />{copy.todaysWorkout}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {visibleStates.workout === "loading" || visibleStates.workout === "idle" ? <p className="text-sm text-muted-foreground">{copy.loading}</p> : null}
                {visibleStates.workout === "failed" ? <SectionFailure message={errors.workout ?? copy.sectionUnavailable} copy={copy} onRetry={() => setReload((value) => value + 1)} /> : null}
                {visibleStates.workout === "loaded" && visibleWorkoutData.day ? (
                  <>
                    <div><p className="font-semibold">{visibleWorkoutData.day.day_name}</p><p className="text-sm text-muted-foreground">{interpolateFocusedTodayCopy(copy.exercisesCount, { count: visibleWorkoutData.day.exercises.length })}{visibleWorkoutData.plan?.session_duration_minutes ? ` · ${interpolateFocusedTodayCopy(copy.durationMinutes, { minutes: visibleWorkoutData.plan.session_duration_minutes })}` : ""}</p></div>
                    <div className="space-y-1">{visibleWorkoutData.day.exercises.slice(0, 3).map((exercise) => <p key={exercise.id} className="text-sm text-muted-foreground">{exercise.sets ?? 1} × {exercise.reps ?? "?"} {exercise.exercise_name}</p>)}</div>
                    {workoutCardHref ? <Button asChild variant="outline" className="min-h-11"><Link href={workoutCardHref}>{workoutState === "active" ? copy.resumeWorkout : workoutState === "completed" ? copy.viewWorkout : copy.startWorkout}</Link></Button> : null}
                  </>
                ) : null}
                {visibleStates.workout === "loaded" && !visibleWorkoutData.day ? <><p className="text-sm text-muted-foreground">{copy.noWorkoutScheduled}</p><Button asChild className="min-h-11"><Link href="/my-workout/plans">{copy.openTrain}</Link></Button></> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Utensils className="h-5 w-5" />{copy.todaysMeals}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {visibleStates.meals === "loading" || visibleStates.meals === "idle" ? <p className="text-sm text-muted-foreground">{copy.loading}</p> : null}
                {visibleStates.meals === "failed" ? <SectionFailure message={errors.meals ?? copy.sectionUnavailable} copy={copy} onRetry={() => setReload((value) => value + 1)} /> : null}
                {visibleStates.meals === "loaded" && relevantMeal ? (
                  <>
                    <div><p className="font-semibold">{mealTypeLabel(relevantMeal.meal_type, copy)}: {relevantMeal.food_name}</p><p className="text-sm text-muted-foreground">{Math.round(relevantMeal.calories)} kcal · {Math.round(relevantMeal.protein_g)} g {copy.protein}</p></div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => void markMealDone(relevantMeal)} disabled={pendingMealIds.has(relevantMeal.id)} className="min-h-11"><Check className="h-4 w-4" />{pendingMealIds.has(relevantMeal.id) ? copy.saving : copy.markDone}</Button>
                      <Button type="button" variant="outline" onClick={() => void skipMealItems([relevantMeal])} disabled={pendingMealIds.has(relevantMeal.id)} className="min-h-11">{copy.skip}</Button>
                      <Button type="button" variant="ghost" onClick={() => void skipMealItems(visibleMealItems.filter((item) => item.status === "planned"))} disabled={!visibleMealItems.some((item) => item.status === "planned")} className="min-h-11">{copy.skipAll}</Button>
                    </div>
                  </>
                ) : null}
                {visibleStates.meals === "loaded" && !relevantMeal ? <p className="text-sm text-muted-foreground">{visibleMealItems.some((item) => item.status === "skipped") ? copy.skipped : copy.noMealsPlanned}</p> : null}
                {visibleStates.meals === "loaded" ? <Button asChild variant="outline" className="min-h-11"><Link href={`/my-meal-plan?tab=day&date=${today}`}>{copy.openMealPlan}</Link></Button> : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <InlineFeedback message={feedback} onClose={() => setFeedback("")} />

        <WellnessToday
          state={visibleStates.wellness === "failed" ? "failed" : visibleStates.wellness === "loaded" ? "loaded" : "loading"}
          habits={visibleWellnessData.habits}
          supplements={visibleWellnessData.supplements}
          sleepLogs={visibleWellnessData.sleepLogs}
          errors={visibleWellnessData.errors}
          copy={copy}
        />

        {visibleStates.shopping === "failed" ? (
          <section aria-labelledby="shopping-failed"><Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 id="shopping-failed" className="font-semibold">{copy.shoppingList}</h2><p className="text-sm text-muted-foreground">{errors.shopping ?? copy.sectionUnavailable}</p></div><Button type="button" variant="outline" className="min-h-11" onClick={() => setReload((value) => value + 1)}>{copy.retry}</Button></CardContent></Card></section>
        ) : null}
        {visibleStates.shopping === "loaded" && visibleGroceryItems.length ? (
          <section aria-labelledby="shopping-list" className="lg:max-w-[calc(50%-0.5rem)]">
            <Card>
              <CardHeader>
                <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-start" aria-expanded={shoppingExpanded} onClick={() => setShoppingExpanded((value) => !value)}>
                  <span><CardTitle id="shopping-list" className="flex items-center gap-2 text-base"><ShoppingCart className="h-5 w-5" />{copy.shoppingList}</CardTitle><span className="mt-1 block text-xs text-muted-foreground">{unbought.length} {copy.remaining} · {bought.length} {copy.bought}{alreadyHave.length ? ` · ${alreadyHave.length} ${copy.alreadyHave}` : ""}</span></span>
                  {shoppingExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>
              </CardHeader>
              {shoppingExpanded ? (
                <CardContent className="space-y-3">
                  <div className="space-y-2">{unbought.slice(0, 6).map((item) => <label key={item.id} className="flex min-h-12 items-center gap-3 rounded-[12px] border border-border/70 px-3"><input type="checkbox" checked={item.checked} disabled={pendingGroceryIds.has(item.id)} onChange={() => void toggleBought(item)} className="h-5 w-5 accent-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.item_name}</span><span className="block text-xs text-muted-foreground">{item.quantity ?? ""} {item.unit ?? ""}</span></span></label>)}</div>
                  {bought.length ? <div><button type="button" onClick={() => setBoughtExpanded((value) => !value)} className="flex min-h-11 items-center gap-2 text-sm font-semibold" aria-expanded={boughtExpanded}>{copy.boughtItems}{boughtExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{boughtExpanded ? <div className="space-y-2">{bought.map((item) => <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-[12px] border border-border/70 px-3 opacity-75"><input type="checkbox" checked disabled={pendingGroceryIds.has(item.id)} onChange={() => void toggleBought(item)} className="h-5 w-5 accent-primary" /><span className="line-through">{item.item_name}</span></label>)}</div> : null}</div> : null}
                  <Button asChild variant="outline" className="min-h-11"><Link href={`/my-meal-plan?tab=shopping&date=${today}`}>{copy.openFullGrocery}</Link></Button>
                </CardContent>
              ) : null}
            </Card>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SectionFailure({ message, copy, onRetry }: { message: string; copy: ReturnType<typeof getFocusedTodayCopy>; onRetry: () => void }) {
  return <div role="alert"><p className="text-sm text-muted-foreground">{message}</p><Button type="button" variant="outline" className="mt-3 min-h-11" onClick={onRetry}>{copy.retry}</Button></div>;
}
