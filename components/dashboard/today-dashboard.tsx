"use client";

import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Dumbbell, ShoppingCart, Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { PageHeading } from "@/components/layout/page-heading";
import { TodayProgress } from "@/components/dashboard/today-progress";
import { WellnessToday, type WellnessPartialErrors } from "@/components/dashboard/wellness-today";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { InlineFeedback } from "@/components/motion";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getFocusedTodayCopy, interpolateFocusedTodayCopy } from "@/lib/dashboard/focused-today-copy";
import { resolveTodayWorkout, selectRelevantMeal, todayWorkoutActionHref } from "@/lib/dashboard/today-model";
import { remainingMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import { startOfWeek } from "@/services/reports/reporting";
import { getMealPlanItemsForDate, markDirectMealPlanItemDone, markDirectMealPlanItemSkipped, markDirectMealPlanItemsSkipped } from "@/services/database/meal-plan";
import { getDefaultUserWorkoutPlan, getCurrentWeekday } from "@/services/database/workout-plans";
import { getOpenWorkoutDaySession, getWorkoutHistory } from "@/services/database/workout-sessions";
import { getGroceryItems, upsertGroceryItem } from "@/services/database/execution-layer";
import { getFitnessHabits, getSupplementLogs } from "@/services/database/wellness";
import { getDashboardSleepRecoveryLogs, getDashboardWaterLogs } from "@/services/database/dashboard-today-sources";
import {
  getTodayNutritionData,
  getTodayNutritionTargetData,
  subscribeToTodayNutritionTargetChanges
} from "@/services/database/today-nutrition";
import { logRecoverableError, userSafeError } from "@/lib/error-formatting";
import { initialTodayNutritionData, knownFoodLogCount, type TodayNutritionData, type TodayNutritionTargetData } from "@/lib/dashboard/today-nutrition";
import type { FitnessHabit, MealPlanItem, SleepRecoveryLog, SupplementLog, UserGroceryItem, UserWorkoutPlan, UserWorkoutPlanDay, WaterLog, WorkoutSession } from "@/types";

const sourceNames = ["workout", "meals", "nutrition", "hydration", "shopping", "wellness"] as const;
type SourceName = (typeof sourceNames)[number];
type SourceState = "idle" | "loading" | "loaded" | "failed";
type SourceStates = Record<SourceName, SourceState>;
type SourceErrors = Partial<Record<SourceName, string>>;
type WorkoutData = { plan: UserWorkoutPlan | null; day: UserWorkoutPlanDay | null; sessions: WorkoutSession[]; openSessionId: string | null };
type WellnessData = { habits: FitnessHabit[]; supplements: SupplementLog[]; sleepLogs: SleepRecoveryLog[]; errors: WellnessPartialErrors };

const initialStates = Object.fromEntries(sourceNames.map((name) => [name, "idle"])) as SourceStates;
const initialWellness: WellnessData = { habits: [], supplements: [], sleepLogs: [], errors: {} };

function mealTypeLabel(value: string | undefined, copy: ReturnType<typeof getFocusedTodayCopy>) {
  if (value === "Breakfast") return copy.breakfast;
  if (value === "Lunch") return copy.lunch;
  if (value === "Dinner") return copy.dinner;
  return copy.snack;
}

function progressSourceState(state: SourceState): "loading" | "loaded" | "failed" {
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
  const [states, setStates] = useState<SourceStates>(initialStates);
  const [errors, setErrors] = useState<SourceErrors>({});
  const [workoutData, setWorkoutData] = useState<WorkoutData>({ plan: null, day: null, sessions: [], openSessionId: null });
  const [mealItems, setMealItems] = useState<MealPlanItem[]>([]);
  const [nutritionData, setNutritionData] = useState<TodayNutritionData>(initialTodayNutritionData);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [groceryItems, setGroceryItems] = useState<UserGroceryItem[]>([]);
  const [wellnessData, setWellnessData] = useState<WellnessData>(initialWellness);
  const [shoppingExpanded, setShoppingExpanded] = useState(false);
  const [boughtExpanded, setBoughtExpanded] = useState(false);
  const [pendingMealIds, setPendingMealIds] = useState<Set<string>>(new Set());
  const [pendingGroceryIds, setPendingGroceryIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [reload, setReload] = useState(0);
  const requestVersion = useRef(0);
  const targetLoadRef = useRef<Promise<TodayNutritionTargetData> | null>(null);

  const setSource = useCallback((source: SourceName, state: SourceState, error?: string) => {
    setStates((current) => ({ ...current, [source]: state }));
    setErrors((current) => ({ ...current, [source]: error }));
  }, []);

  const loadTodayTargetOnce = useCallback(() => {
    if (!user?.id) return Promise.reject(new Error("A signed-in user is required."));
    if (targetLoadRef.current) return targetLoadRef.current;
    const request = getTodayNutritionTargetData(user.id, today).finally(() => {
      if (targetLoadRef.current === request) targetLoadRef.current = null;
    });
    targetLoadRef.current = request;
    return request;
  }, [today, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const version = ++requestVersion.current;
    setStates(Object.fromEntries(sourceNames.map((name) => [name, "loading"])) as SourceStates);
    setErrors({});

    const run = async <T,>(source: SourceName, loader: () => Promise<T>, apply: (value: T) => void) => {
      try {
        const value = await loader();
        if (requestVersion.current !== version) return;
        apply(value);
        setSource(source, "loaded");
      } catch (error) {
        if (requestVersion.current !== version) return;
        logRecoverableError(`today.${source}`, error);
        setSource(source, "failed", userSafeError(error, copy.sectionUnavailable));
      }
    };

    void run("workout", async () => {
      const [plan, sessions] = await Promise.all([getDefaultUserWorkoutPlan(user.id), getWorkoutHistory(user.id)]);
      const day = plan?.days.find((item) => item.weekday === getCurrentWeekday() && item.exercises.length > 0) ?? null;
      const open = day ? await getOpenWorkoutDaySession(user.id, day.id) : null;
      return { plan, day, sessions, openSessionId: open?.id ?? null } satisfies WorkoutData;
    }, setWorkoutData);
    void run("meals", () => getMealPlanItemsForDate(user.id, today), setMealItems);
    void run("nutrition", () => getTodayNutritionData(user.id, today, {
      loadLogs: (id, date) => import("@/services/database/nutrition").then(({ getTodayFoodLogs }) => getTodayFoodLogs(id, date, { throwOnError: true })),
      loadTargetData: () => loadTodayTargetOnce()
    }), setNutritionData);
    void run("hydration", () => getDashboardWaterLogs(user.id, today), setWaterLogs);
    void run("shopping", () => getGroceryItems(user.id, startOfWeek(today)), setGroceryItems);
    void run("wellness", async () => {
      const [habitsResult, supplementsResult, sleepResult] = await Promise.allSettled([
        getFitnessHabits(user.id, today, { throwOnError: true }),
        getSupplementLogs(user.id, today, { throwOnError: true }),
        getDashboardSleepRecoveryLogs(user.id, 7)
      ]);
      if ([habitsResult, supplementsResult, sleepResult].every((result) => result.status === "rejected")) throw new Error(copy.sectionUnavailable);
      return {
        habits: habitsResult.status === "fulfilled" ? habitsResult.value : [],
        supplements: supplementsResult.status === "fulfilled" ? supplementsResult.value : [],
        sleepLogs: sleepResult.status === "fulfilled" ? sleepResult.value : [],
        errors: {
          habits: habitsResult.status === "rejected" ? copy.sectionUnavailable : undefined,
          supplements: supplementsResult.status === "rejected" ? copy.sectionUnavailable : undefined,
          sleep: sleepResult.status === "rejected" ? copy.sectionUnavailable : undefined
        }
      } satisfies WellnessData;
    }, setWellnessData);

    return () => {
      if (requestVersion.current === version) requestVersion.current += 1;
    };
  }, [copy.sectionUnavailable, loadTodayTargetOnce, reload, setSource, today, user?.id]);

  const retryFoodLogs = useCallback(async () => {
    if (!user?.id) return false;
    setNutritionData((current) => ({ ...current, logsState: "loading", logsError: null }));
    try {
      const { getTodayFoodLogs } = await import("@/services/database/nutrition");
      const logs = await getTodayFoodLogs(user.id, today, { throwOnError: true });
      setNutritionData((current) => ({ ...current, logs, logsState: "loaded", logsError: null, totalsIncomplete: false }));
      return true;
    } catch (error) {
      setNutritionData((current) => ({ ...current, logs: null, logsState: "failed", logsError: userSafeError(error, copy.unavailable), totalsIncomplete: current.totalsIncomplete }));
      return false;
    }
  }, [copy.unavailable, today, user?.id]);

  const retryNutritionTarget = useCallback(async () => {
    if (!user?.id) return false;
    setNutritionData((current) => ({ ...current, targetsState: "loading", targetsError: null }));
    try {
      const result = await loadTodayTargetOnce();
      setNutritionData((current) => ({ ...current, targets: result.targets, activeTarget: result.activeTarget, targetsState: "loaded", targetsError: null }));
      return true;
    } catch (error) {
      setNutritionData((current) => ({ ...current, targets: null, activeTarget: null, targetsState: "failed", targetsError: userSafeError(error, copy.targetUnavailable) }));
      return false;
    }
  }, [copy.targetUnavailable, loadTodayTargetOnce, user?.id]);

  useEffect(() => subscribeToTodayNutritionTargetChanges(window, today, () => { void retryNutritionTarget(); }), [retryNutritionTarget, today]);

  const totals = useMemo(() => nutritionData.logs ? sumFoodLogs(nutritionData.logs) : null, [nutritionData.logs]);
  const targets = nutritionData.targets;
  const remaining = targets && totals ? remainingMacros({ calories: targets.daily_calories, protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g, water_ml: targets.water_ml }, totals) : null;
  const waterTotal = useMemo(() => waterLogs.reduce((sum, item) => sum + Number(item.amount_ml), 0), [waterLogs]);
  const workoutResolution = resolveTodayWorkout({ today, planDayId: workoutData.day?.id ?? null, openSessionId: workoutData.openSessionId, sessions: workoutData.sessions });
  const workoutState = workoutResolution.state;
  const workoutCardHref = todayWorkoutActionHref(workoutResolution, workoutData.day?.id ?? null);
  const relevantMeal = selectRelevantMeal(mealItems);
  const todaySleep = wellnessData.sleepLogs.find((item) => item.log_date === today) ?? wellnessData.sleepLogs[0] ?? null;
  const unbought = groceryItems.filter((item) => !item.checked && !item.already_have);
  const bought = groceryItems.filter((item) => item.checked);
  const alreadyHave = groceryItems.filter((item) => item.already_have);

  useEffect(() => {
    const normalize = (state: SourceState) => state === "idle" ? "unknown" : state;
    setDashboardContext({
      route: "/dashboard",
      today,
      localHour: new Date().getHours(),
      units: { energy: settings.energyUnit, liquid: settings.liquidUnit, weight: settings.weightUnit },
      workout: {
        hasPlan: Boolean(workoutData.plan),
        scheduled: workoutState === "scheduled",
        active: workoutState === "active",
        completed: workoutState === "completed",
        title: workoutData.day?.day_name ?? null,
        exerciseCount: workoutData.day?.exercises.length ?? null,
        durationMinutes: workoutData.plan?.session_duration_minutes ?? null,
        historyCount: workoutData.sessions.filter((session) => session.status === "completed").length
      },
      nutrition: {
        hasTargets: Boolean(targets),
        targetsState: nutritionData.targetsState,
        foodLogsState: nutritionData.logsState,
        remainingCalories: remaining?.calories ?? null,
        remainingProtein: remaining?.protein_g ?? null,
        remainingCarbs: remaining?.carbs_g ?? null,
        remainingFat: remaining?.fat_g ?? null,
        foodLogCount: knownFoodLogCount(nutritionData),
        mealPlanCount: states.meals === "loaded" ? mealItems.length : null,
        plannedMealCount: states.meals === "loaded" ? mealItems.filter((item) => item.status === "planned").length : null
      },
      grocery: { state: normalize(states.shopping), itemCount: states.shopping === "loaded" ? groceryItems.length : null },
      hydration: { state: normalize(states.hydration), hasTarget: Boolean(targets?.water_ml), logCount: states.hydration === "loaded" ? waterLogs.length : null, remainingMl: states.hydration === "loaded" && targets?.water_ml ? Math.max(0, targets.water_ml - waterTotal) : null },
      recovery: { state: normalize(states.wellness), hasData: Boolean(todaySleep), sleepHours: todaySleep?.hours_slept ?? null, poorRecovery: Boolean(todaySleep && (todaySleep.recovery_level === "low" || todaySleep.fatigue_level === "high")) },
      wellness: { state: normalize(states.wellness), habitCount: states.wellness === "loaded" ? wellnessData.habits.length : null, supplementCount: states.wellness === "loaded" ? wellnessData.supplements.length : null },
      endOfWeek: new Date(`${today}T12:00:00`).getDay() === 0
    });
  }, [groceryItems.length, mealItems, nutritionData, remaining, setDashboardContext, settings.energyUnit, settings.liquidUnit, settings.weightUnit, states.hydration, states.meals, states.shopping, states.wellness, targets, today, todaySleep, waterLogs.length, waterTotal, wellnessData.habits.length, wellnessData.supplements.length, workoutData, workoutState]);

  async function markMealDone(item: MealPlanItem) {
    if (pendingMealIds.has(item.id) || item.status !== "planned") return;
    setPendingMealIds((current) => new Set(current).add(item.id));
    try {
      const result = await markDirectMealPlanItemDone(item);
      setMealItems((current) => current.map((value) => value.id === item.id ? result.item : value));
      if (result.log && nutritionData.logsState === "loaded" && nutritionData.logs) {
        setNutritionData((current) => ({ ...current, logs: current.logs ? [result.log!, ...current.logs] : null }));
      } else if (result.log) {
        setNutritionData((current) => ({ ...current, totalsIncomplete: true }));
        await retryFoodLogs();
      }
      setFeedback(copy.mealSaved);
    } catch (error) {
      toast({ title: copy.mealDoneFailed, description: userSafeError(error), variant: "error" });
    } finally {
      setPendingMealIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
    }
  }

  async function skipMealItems(items: MealPlanItem[]) {
    if (!user?.id || !items.length || items.some((item) => pendingMealIds.has(item.id))) return;
    const previous = mealItems;
    const ids = new Set(items.map((item) => item.id));
    setPendingMealIds((current) => new Set([...current, ...ids]));
    setMealItems((current) => current.map((item) => ids.has(item.id) ? { ...item, status: "skipped" } : item));
    try {
      const saved = items.length === 1 ? [await markDirectMealPlanItemSkipped(items[0])] : await markDirectMealPlanItemsSkipped(user.id, items.map((item) => item.id));
      const byId = new Map(saved.map((item) => [item.id, item]));
      setMealItems((current) => current.map((item) => byId.get(item.id) ?? item));
      setFeedback(copy.mealSkipped);
    } catch (error) {
      setMealItems(previous);
      toast({ title: copy.mealSkipFailed, description: userSafeError(error), variant: "error" });
    } finally {
      setPendingMealIds((current) => { const next = new Set(current); ids.forEach((id) => next.delete(id)); return next; });
    }
  }

  async function toggleBought(item: UserGroceryItem) {
    if (!user?.id || pendingGroceryIds.has(item.id)) return;
    const previous = groceryItems;
    setPendingGroceryIds((current) => new Set(current).add(item.id));
    setGroceryItems((current) => current.map((value) => value.id === item.id ? { ...value, checked: !item.checked } : value));
    try {
      const saved = await upsertGroceryItem(user.id, { ...item, checked: !item.checked });
      setGroceryItems((current) => current.map((value) => value.id === item.id ? saved : value));
    } catch (error) {
      setGroceryItems(previous);
      toast({ title: copy.groceryUpdateFailed, description: userSafeError(error), variant: "error" });
    } finally {
      setPendingGroceryIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
    }
  }

  const localizedDate = new Intl.DateTimeFormat(language === "de" ? "de-DE" : language === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${today}T12:00:00`));

  return (
    <div dir={dir}>
      <PageHeading
        title={`${copy.today}${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description={`${localizedDate} · ${workoutData.day ? copy.trainingDay : copy.restDay}`}
        action={<Button type="button" className="min-h-12" onClick={() => openPrompts()}><OpenAiBlossom className="h-5 w-5" />{copy.askChatGpt}</Button>}
      />
      <div className="space-y-4">
        <TodayProgress
          totals={totals}
          logsState={nutritionData.logsState}
          targets={targets}
          targetsState={nutritionData.targetsState}
          waterTotal={states.hydration === "loaded" ? waterTotal : null}
          hydrationState={progressSourceState(states.hydration)}
          energyUnit={settings.energyUnit}
          liquidUnit={settings.liquidUnit}
          copy={copy}
        />
        {nutritionData.logsState === "failed" || nutritionData.totalsIncomplete ? (
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
                {states.workout === "loading" || states.workout === "idle" ? <p className="text-sm text-muted-foreground">{copy.loading}</p> : null}
                {states.workout === "failed" ? <SectionFailure message={errors.workout ?? copy.sectionUnavailable} copy={copy} onRetry={() => setReload((value) => value + 1)} /> : null}
                {states.workout === "loaded" && workoutData.day ? (
                  <>
                    <div><p className="font-semibold">{workoutData.day.day_name}</p><p className="text-sm text-muted-foreground">{interpolateFocusedTodayCopy(copy.exercisesCount, { count: workoutData.day.exercises.length })}{workoutData.plan?.session_duration_minutes ? ` · ${interpolateFocusedTodayCopy(copy.durationMinutes, { minutes: workoutData.plan.session_duration_minutes })}` : ""}</p></div>
                    <div className="space-y-1">{workoutData.day.exercises.slice(0, 3).map((exercise) => <p key={exercise.id} className="text-sm text-muted-foreground">{exercise.sets ?? 1} × {exercise.reps ?? "?"} {exercise.exercise_name}</p>)}</div>
                    {workoutCardHref ? <Button asChild variant="outline" className="min-h-11"><Link href={workoutCardHref}>{workoutState === "active" ? copy.resumeWorkout : workoutState === "completed" ? copy.viewWorkout : copy.startWorkout}</Link></Button> : null}
                  </>
                ) : null}
                {states.workout === "loaded" && !workoutData.day ? <><p className="text-sm text-muted-foreground">{copy.noWorkoutScheduled}</p><Button asChild className="min-h-11"><Link href="/my-workout/plans">{copy.openTrain}</Link></Button></> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Utensils className="h-5 w-5" />{copy.todaysMeals}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {states.meals === "loading" || states.meals === "idle" ? <p className="text-sm text-muted-foreground">{copy.loading}</p> : null}
                {states.meals === "failed" ? <SectionFailure message={errors.meals ?? copy.sectionUnavailable} copy={copy} onRetry={() => setReload((value) => value + 1)} /> : null}
                {states.meals === "loaded" && relevantMeal ? (
                  <>
                    <div><p className="font-semibold">{mealTypeLabel(relevantMeal.meal_type, copy)}: {relevantMeal.food_name}</p><p className="text-sm text-muted-foreground">{Math.round(relevantMeal.calories)} kcal · {Math.round(relevantMeal.protein_g)} g {copy.protein}</p></div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => void markMealDone(relevantMeal)} disabled={pendingMealIds.has(relevantMeal.id)} className="min-h-11"><Check className="h-4 w-4" />{pendingMealIds.has(relevantMeal.id) ? copy.saving : copy.markDone}</Button>
                      <Button type="button" variant="outline" onClick={() => void skipMealItems([relevantMeal])} disabled={pendingMealIds.has(relevantMeal.id)} className="min-h-11">{copy.skip}</Button>
                      <Button type="button" variant="ghost" onClick={() => void skipMealItems(mealItems.filter((item) => item.status === "planned"))} disabled={!mealItems.some((item) => item.status === "planned")} className="min-h-11">{copy.skipAll}</Button>
                    </div>
                  </>
                ) : null}
                {states.meals === "loaded" && !relevantMeal ? <p className="text-sm text-muted-foreground">{mealItems.some((item) => item.status === "skipped") ? copy.skipped : copy.noMealsPlanned}</p> : null}
                {states.meals === "loaded" ? <Button asChild variant="outline" className="min-h-11"><Link href={`/my-meal-plan?tab=day&date=${today}`}>{copy.openMealPlan}</Link></Button> : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <InlineFeedback message={feedback} onClose={() => setFeedback("")} />

        <WellnessToday
          state={states.wellness === "failed" ? "failed" : states.wellness === "loaded" ? "loaded" : "loading"}
          habits={wellnessData.habits}
          supplements={wellnessData.supplements}
          sleepLogs={wellnessData.sleepLogs}
          errors={wellnessData.errors}
          copy={copy}
        />

        {states.shopping === "failed" ? (
          <section aria-labelledby="shopping-failed"><Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 id="shopping-failed" className="font-semibold">{copy.shoppingList}</h2><p className="text-sm text-muted-foreground">{errors.shopping ?? copy.sectionUnavailable}</p></div><Button type="button" variant="outline" className="min-h-11" onClick={() => setReload((value) => value + 1)}>{copy.retry}</Button></CardContent></Card></section>
        ) : null}
        {states.shopping === "loaded" && groceryItems.length ? (
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
