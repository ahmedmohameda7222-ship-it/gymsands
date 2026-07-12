"use client";

import Link from "next/link";
import { Check, CheckCircle2, ChevronDown, ChevronUp, Dumbbell, Droplets, Flame, Loader2, ShoppingCart, Soup, Utensils, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { DailyCheckins } from "@/components/wellness/daily-checkins";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CardGridSkeleton, EmptyState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { InlineFeedback } from "@/components/motion";
import { useTodayTranslation } from "@/lib/i18n/today";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { buildTodayActions, enabledQuickLogs, hasCurrentDayActivity, quickLogRoutes, resolveTodayWorkout, selectRelevantMeal, todayWorkoutActionHref, type TodayAction, type TodayWorkoutState } from "@/lib/dashboard/today-model";
import { formatEnergy, formatLiquid } from "@/lib/dashboard/today-units";
import { percent, remainingMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import { getActiveTargetOverride, resolveActiveNutritionTarget } from "@/services/nutrition/active-target";
import { startOfWeek } from "@/services/reports/reporting";
import { getOnboarding } from "@/services/database/profile";
import { getProgressEntries } from "@/services/database/progress";
import { addWaterLog, getCalorieTargets, getTodayFoodLogs, getWaterLogs } from "@/services/database/nutrition";
import { getMealPlanItemsForDate, markDirectMealPlanItemDone, markDirectMealPlanItemSkipped, markDirectMealPlanItemsSkipped } from "@/services/database/meal-plan";
import { getDefaultUserWorkoutPlan, getCurrentWeekday } from "@/services/database/workout-plans";
import { getOpenWorkoutDaySession, getWorkoutHistory } from "@/services/database/workout-sessions";
import { getDailyCheckins, getGroceryItems, getNutritionTargetProfiles, upsertGroceryItem } from "@/services/database/execution-layer";
import { getFitnessHabits, getSleepRecoveryLogs, getSupplementLogs } from "@/services/database/wellness";
import { logRecoverableError, userSafeError } from "@/lib/error-formatting";
import { initialTodayNutritionData, knownFoodLogCount, resolveTodayNutritionSources, type TodayNutritionData, type TodayNutritionTargetData } from "@/lib/dashboard/today-nutrition";
import type { FitnessHabit, MealPlanItem, OnboardingAnswers, ProgressEntry, SleepRecoveryLog, SupplementLog, UserDailyCheckin, UserGroceryItem, UserWorkoutPlan, UserWorkoutPlanDay, WaterLog, WorkoutSession } from "@/types";

const sourceNames = ["workout", "meals", "nutrition", "hydration", "shopping", "wellness", "connection", "setup"] as const;
type SourceName = (typeof sourceNames)[number];
type SourceState = "idle" | "loading" | "loaded" | "failed";
type SourceStates = Record<SourceName, SourceState>;
type SourceErrors = Partial<Record<SourceName, string>>;
type WorkoutData = { plan: UserWorkoutPlan | null; day: UserWorkoutPlanDay | null; sessions: WorkoutSession[]; openSessionId: string | null };
type WellnessData = { habits: FitnessHabit[]; supplements: SupplementLog[]; sleepLogs: SleepRecoveryLog[]; checkins: UserDailyCheckin[]; partialErrors: string[]; executionState: "loaded" | "partial" };
type SetupData = { onboarding: OnboardingAnswers | null; progress: ProgressEntry[] };
type ConnectionState = "connected" | "disconnected" | "unknown";

const initialStates = Object.fromEntries(sourceNames.map((name) => [name, "idle"])) as SourceStates;
const quickLogLabels = { water: "water", meal: "food", weight: "weight", workout: "workout", progress: "progress", sleep: "sleep", supplements: "supplements", wellness: "wellness" } as const;

function sourceLabel(source: SourceName, tt: ReturnType<typeof useTodayTranslation>["tt"]) {
  const keys: Record<SourceName, Parameters<typeof tt>[0]> = {
    workout: "sourceWorkout", meals: "sourceMeals", nutrition: "sourceNutrition", hydration: "sourceHydration",
    shopping: "sourceShopping", wellness: "sourceWellness", connection: "sourceConnection", setup: "sourceSetup"
  };
  return tt(keys[source]);
}

function mealTypeLabel(value: string | undefined, tt: ReturnType<typeof useTodayTranslation>["tt"]) {
  if (value === "Breakfast") return tt("mealBreakfast");
  if (value === "Lunch") return tt("mealLunch");
  if (value === "Dinner") return tt("mealDinner");
  if (value === "Snack") return tt("mealSnack");
  return value ?? "";
}

function actionCopy(action: TodayAction, tt: ReturnType<typeof useTodayTranslation>["tt"], liquidUnit: "ml" | "oz") {
  if (action.id === "resume-workout" || action.id === "start-workout") {
    const duration = action.workoutDurationMinutes ? ` · ${tt("durationMinutes", { minutes: action.workoutDurationMinutes })}` : "";
    return {
      title: action.workoutTitle || tt(action.id === "resume-workout" ? "resumeActiveWorkout" : "startTodayWorkout"),
      detail: `${tt("exercisesCount", { count: action.workoutExerciseCount ?? 0 })}${duration}`,
      label: tt(action.id === "resume-workout" ? "resumeWorkout" : "startWorkout")
    };
  }
  if (action.id === "meal") return { title: tt("completeMeal", { meal: mealTypeLabel(action.mealType, tt) }), detail: action.foodName ?? "", label: tt("openTodaysMeals") };
  if (action.id === "first-meal") return { title: tt("logFirstMeal"), detail: tt("noFoodLogged"), label: tt("logFood") };
  if (action.id === "water") {
    const amount = formatLiquid(action.waterAmountMl ?? 0, liquidUnit);
    const remaining = formatLiquid(action.waterRemainingMl ?? 0, liquidUnit);
    return { title: tt("addWaterTitle", { amount }), detail: tt("waterRemainingDetail", { remaining }), label: tt("addWaterAmount", { amount }) };
  }
  if (action.id === "protein") return { title: tt("proteinRemaining", { amount: Math.round(action.remainingProtein ?? 0) }), detail: tt("proteinFirst"), label: tt("logFood") };
  return { title: tt("completeDailyCheckin"), detail: tt("checkinDetail"), label: tt("checkIn") };
}

export function TodayDashboard() {
  const { user, profile, session } = useAuth();
  const router = useRouter();
  const { settings } = useUserSettings();
  const { language, dir, tt } = useTodayTranslation();
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
  const [wellnessData, setWellnessData] = useState<WellnessData>({ habits: [], supplements: [], sleepLogs: [], checkins: [], partialErrors: [], executionState: "loaded" });
  const [setupData, setSetupData] = useState<SetupData>({ onboarding: null, progress: [] });
  const [connection, setConnection] = useState<ConnectionState>("unknown");
  const [setupExpanded, setSetupExpanded] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [shoppingExpanded, setShoppingExpanded] = useState(false);
  const [boughtExpanded, setBoughtExpanded] = useState(false);
  const [pendingMealIds, setPendingMealIds] = useState<Set<string>>(new Set());
  const [pendingGroceryIds, setPendingGroceryIds] = useState<Set<string>>(new Set());
  const [waterPending, setWaterPending] = useState(false);
  const [feedback, setFeedback] = useState("");

  const setSource = useCallback((source: SourceName, state: SourceState, error?: string) => {
    setStates((current) => ({ ...current, [source]: state }));
    setErrors((current) => ({ ...current, [source]: error }));
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!user?.id) return;
    setStates(Object.fromEntries(sourceNames.map((name) => [name, "loading"])) as SourceStates);
    setErrors({});

    const loadWorkout = async (): Promise<WorkoutData> => {
      const [plan, sessions] = await Promise.all([getDefaultUserWorkoutPlan(user.id), getWorkoutHistory(user.id)]);
      const day = plan?.days.find((item) => item.weekday === getCurrentWeekday() && item.exercises.length > 0) ?? null;
      const open = day ? await getOpenWorkoutDaySession(user.id, day.id) : null;
      return { plan, day, sessions, openSessionId: open?.id ?? null };
    };
    const loadNutrition = async (): Promise<TodayNutritionData> => {
      const [logsResult, targetResult, profilesResult, planResult] = await Promise.allSettled([
        getTodayFoodLogs(user.id, today, { throwOnError: true }),
        getCalorieTargets(user.id, { throwOnError: true }),
        user.id === "mock-user" ? Promise.resolve([]) : getNutritionTargetProfiles(user.id),
        getDefaultUserWorkoutPlan(user.id)
      ]);

      let resolvedTargets: PromiseSettledResult<TodayNutritionTargetData>;
      if (targetResult.status === "fulfilled" || profilesResult.status === "fulfilled") {
        const base = targetResult.status === "fulfilled" ? targetResult.value : null;
        const profiles = profilesResult.status === "fulfilled" ? profilesResult.value : [];
        const targetPlan = planResult.status === "fulfilled" ? planResult.value : null;
        const targetDay = targetPlan?.days.find((item) => item.weekday === getCurrentWeekday() && item.exercises.length > 0) ?? null;
        const automaticType = targetDay ? "training_day" : "rest_day";
        const override = getActiveTargetOverride(user.id, today);
        const activeTarget = resolveActiveNutritionTarget({ profiles, baseTarget: base, requestedType: override === "auto" ? automaticType : override });
        resolvedTargets = {
          status: "fulfilled",
          value: { targets: activeTarget.hasTarget ? activeTarget.values : null, activeTarget }
        };
      } else {
        resolvedTargets = { status: "rejected", reason: targetResult.reason };
      }

      return resolveTodayNutritionSources(logsResult, resolvedTargets);
    };
    const loadWellness = async (): Promise<WellnessData> => {
      const results = await Promise.allSettled([
        getFitnessHabits(user.id, today),
        getSupplementLogs(user.id),
        getSleepRecoveryLogs(user.id, 7),
        getDailyCheckins(user.id, today, today)
      ]);
      const partialErrors = results.filter((result) => result.status === "rejected").map(() => tt("sectionUnavailable"));
      if (results.every((result) => result.status === "rejected")) throw new Error(tt("sectionUnavailable"));
      return {
        habits: results[0].status === "fulfilled" ? results[0].value : [],
        supplements: results[1].status === "fulfilled" ? results[1].value : [],
        sleepLogs: results[2].status === "fulfilled" ? results[2].value : [],
        checkins: results[3].status === "fulfilled" ? results[3].value : [],
        partialErrors,
        executionState: results.every((result) => result.status === "fulfilled") ? "loaded" : "partial"
      };
    };
    const loadConnection = async (): Promise<ConnectionState> => {
      if (!session?.access_token) return "unknown";
      const response = await fetch("/api/mcp/connections", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("Connection status could not be verified.");
      const data = await response.json();
      const connections = Array.isArray(data?.connections) ? data.connections : [];
      return connections.some((item: { is_active?: boolean; revoked_at?: string | null }) => item.is_active && !item.revoked_at) ? "connected" : "disconnected";
    };

    const loaders: Record<SourceName, () => Promise<unknown>> = {
      workout: loadWorkout,
      meals: () => getMealPlanItemsForDate(user.id, today),
      nutrition: loadNutrition,
      hydration: () => getWaterLogs(user.id, today),
      shopping: () => getGroceryItems(user.id, startOfWeek(today)),
      wellness: loadWellness,
      connection: loadConnection,
      setup: async () => { const [onboarding, progress] = await Promise.all([getOnboarding(user.id), getProgressEntries(user.id)]); return { onboarding, progress } satisfies SetupData; }
    };
    const results = await Promise.allSettled(sourceNames.map((source) => loaders[source]()));
    results.forEach((result, index) => {
      const source = sourceNames[index];
      if (result.status === "rejected") {
        logRecoverableError(`today.${source}`, result.reason);
        setSource(source, "failed", userSafeError(result.reason, tt("sectionUnavailable")));
        if (source === "connection") setConnection("unknown");
        return;
      }
      setSource(source, "loaded");
      if (source === "workout") setWorkoutData(result.value as WorkoutData);
      if (source === "meals") setMealItems(result.value as MealPlanItem[]);
      if (source === "nutrition") setNutritionData(result.value as TodayNutritionData);
      if (source === "hydration") setWaterLogs(result.value as WaterLog[]);
      if (source === "shopping") setGroceryItems(result.value as UserGroceryItem[]);
      if (source === "wellness") setWellnessData(result.value as WellnessData);
      if (source === "connection") setConnection(result.value as ConnectionState);
      if (source === "setup") {
        const value = result.value as SetupData;
        setSetupData(value);
        if (!value.onboarding) router.replace("/onboarding");
      }
    });
  }, [router, session, setSource, today, tt, user]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const retryFoodLogs = useCallback(async () => {
    if (!user?.id) return false;
    setNutritionData((current) => ({ ...current, logsState: "loading", logsError: null }));
    try {
      const logs = await getTodayFoodLogs(user.id, today, { throwOnError: true });
      setNutritionData((current) => ({ ...current, logs, logsState: "loaded", logsError: null, totalsIncomplete: false }));
      return true;
    } catch (error) {
      setNutritionData((current) => ({
        ...current,
        logs: null,
        logsState: "failed",
        logsError: userSafeError(error, tt("foodLogsUnavailable")),
        totalsIncomplete: current.totalsIncomplete
      }));
      return false;
    }
  }, [today, tt, user?.id]);

  const totals = useMemo(() => nutritionData.logs ? sumFoodLogs(nutritionData.logs) : null, [nutritionData.logs]);
  const targets = nutritionData.targets;
  const remaining = targets && totals ? remainingMacros({ calories: targets.daily_calories, protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g, water_ml: targets.water_ml }, totals) : null;
  const waterTotal = useMemo(() => waterLogs.reduce((sum, item) => sum + Number(item.amount_ml), 0), [waterLogs]);
  const workoutResolution = resolveTodayWorkout({ today, planDayId: workoutData.day?.id ?? null, openSessionId: workoutData.openSessionId, sessions: workoutData.sessions });
  const workoutState = workoutResolution.state;
  const workoutCardHref = todayWorkoutActionHref(workoutResolution, workoutData.day?.id ?? null);
  const relevantMeal = selectRelevantMeal(mealItems);
  const todaySleep = wellnessData.sleepLogs.find((item) => item.log_date === today) ?? null;
  const actions = buildTodayActions({ workoutState, workoutTitle: workoutData.day?.day_name, workoutHref: workoutState === "active" || workoutState === "scheduled" ? workoutCardHref : null, workoutExerciseCount: workoutData.day?.exercises.length, workoutDurationMinutes: workoutData.plan?.session_duration_minutes, relevantMeal, foodLogCount: knownFoodLogCount(nutritionData), remainingProtein: remaining?.protein_g ?? null, waterRemainingMl: targets?.water_ml ? Math.max(0, targets.water_ml - waterTotal) : null, checkinAvailable: !wellnessData.checkins.some((item) => item.checkin_date === today) });
  const primaryAction = actions[0] ?? null;
  const secondaryActions = actions.slice(1, 3);
  const primaryActionCopy = primaryAction ? actionCopy(primaryAction, tt, settings.liquidUnit) : null;
  const secondaryActionCopies = secondaryActions.map((action) => ({ action, copy: actionCopy(action, tt, settings.liquidUnit) }));
  const currentActivity = hasCurrentDayActivity({
    foodLogCount: knownFoodLogCount(nutritionData),
    waterLogCount: waterLogs.length,
    doneMealCount: mealItems.filter((item) => item.status === "done").length,
    workoutState,
    completedHabitCount: wellnessData.habits.filter((item) => item.completed).length,
    takenSupplementCount: wellnessData.supplements.filter((item) => item.taken_today).length,
    sleepLoggedToday: Boolean(todaySleep),
    checkinLoggedToday: wellnessData.checkins.some((item) => item.checkin_date === today)
  });
  const activitySourcesKnown =
    nutritionData.logsState === "loaded" &&
    states.workout === "loaded" &&
    states.meals === "loaded" &&
    states.hydration === "loaded" &&
    states.wellness === "loaded" &&
    wellnessData.executionState === "loaded";
  const setupChecklist = [
    { label: tt("finishProfile"), done: Boolean(profile?.full_name), href: "/profile" },
    { label: tt("setTargets"), done: Boolean(targets), href: "/calories" },
    { label: connection === "unknown" ? tt("checkChatGpt") : tt("connectChatGpt"), done: connection === "connected", href: "/settings/connections" },
    { label: tt("createWorkoutPlan"), done: Boolean(workoutData.plan), href: "/my-workout/plans" },
    { label: tt("addMealPlan"), done: mealItems.length > 0 || (nutritionData.logs?.length ?? 0) > 0, href: "/my-meal-plan" },
    { label: tt("addProgress"), done: setupData.progress.length > 0, href: "/progress" },
    { label: tt("startFirstWorkout"), done: workoutData.sessions.length > 0, href: workoutCardHref ?? "/my-workout/plans" }
  ];
  const setupDone = setupChecklist.filter((item) => item.done).length;
  const nextSetup = setupChecklist.find((item) => !item.done);
  const enabledLogs = enabledQuickLogs(settings.quickLogSections, primaryAction?.href);
  const unbought = groceryItems.filter((item) => !item.checked && !item.already_have);
  const bought = groceryItems.filter((item) => item.checked);
  const alreadyHave = groceryItems.filter((item) => item.already_have);
  const workoutTitle = workoutData.day?.day_name ?? null;
const workoutExerciseCount = workoutData.day?.exercises.length ?? 0;
const workoutDurationMinutes = workoutData.plan?.session_duration_minutes ?? null;
const foodLogCount = knownFoodLogCount(nutritionData);
const mealPlanCount = mealItems.length;
const groceryItemCount = groceryItems.length;
const remainingCalories = remaining?.calories ?? null;
const remainingProtein = remaining?.protein_g ?? null;
const hasTargets = Boolean(targets);
const sleepHours = todaySleep?.hours_slept ?? null;
const poorRecovery = Boolean(todaySleep && (todaySleep.recovery_level === "low" || todaySleep.fatigue_level === "high"));
const endOfWeek = new Date(`${today}T12:00:00`).getDay() === 0;
useEffect(() => {
  const normalizeSourceState = (state: SourceState) => state === "idle" ? "unknown" : state;
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
      title: workoutTitle,
      exerciseCount: workoutExerciseCount,
      durationMinutes: workoutDurationMinutes,
      historyCount: workoutData.sessions.filter((session) => session.status === "completed").length
    },
    nutrition: {
      hasTargets,
      targetsState: nutritionData.targetsState,
      foodLogsState: nutritionData.logsState,
      remainingCalories,
      remainingProtein,
      foodLogCount,
      mealPlanCount
    },
    grocery: { state: normalizeSourceState(states.shopping), itemCount: states.shopping === "loaded" ? groceryItemCount : null },
    hydration: {
      state: normalizeSourceState(states.hydration),
      hasTarget: Boolean(targets?.water_ml),
      logCount: states.hydration === "loaded" ? waterLogs.length : null,
      remainingMl: states.hydration === "loaded" && targets?.water_ml ? Math.max(0, targets.water_ml - waterTotal) : null
    },
    recovery: { state: normalizeSourceState(states.wellness), hasData: states.wellness === "loaded" && Boolean(todaySleep), sleepHours, poorRecovery },
    wellness: { state: normalizeSourceState(states.wellness), habitCount: states.wellness === "loaded" ? wellnessData.habits.length : null, supplementCount: states.wellness === "loaded" ? wellnessData.supplements.length : null },
    progress: { state: normalizeSourceState(states.setup), entryCount: states.setup === "loaded" ? setupData.progress.length : null },
    profile: { state: normalizeSourceState(states.setup), hasGoals: Boolean(setupData.onboarding?.goals?.length), hasTrainingPreferences: Boolean(setupData.onboarding), hasNutritionPreferences: false, hasConstraints: Boolean(setupData.onboarding) },
    endOfWeek
  });
}, [endOfWeek, foodLogCount, groceryItemCount, hasTargets, mealPlanCount, nutritionData.logsState, nutritionData.targetsState, poorRecovery, remainingCalories, remainingProtein, setDashboardContext, settings.energyUnit, settings.liquidUnit, settings.weightUnit, sleepHours, states.hydration, states.setup, states.shopping, states.wellness, setupData.onboarding, setupData.progress.length, targets?.water_ml, today, todaySleep, waterLogs.length, waterTotal, wellnessData.habits.length, wellnessData.supplements.length, workoutData.plan, workoutData.sessions, workoutDurationMinutes, workoutExerciseCount, workoutState, workoutTitle]);
  const isInitialLoading = sourceNames.every((source) => states[source] === "loading" || states[source] === "idle");
  const localizedDate = new Intl.DateTimeFormat(language === "de" ? "de-DE" : language === "ar" ? "ar" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${today}T12:00:00`));

  async function addWater(amount: number) {
    if (!user?.id || waterPending) return;
    setWaterPending(true);
    const optimistic: WaterLog = { id: "optimistic-water", user_id: user.id, log_date: today, amount_ml: amount, created_at: `${today}T00:00:00.000Z` };
    setWaterLogs((current) => [optimistic, ...current]);
    try { const saved = await addWaterLog(user.id, today, amount); setWaterLogs((current) => current.map((item) => item.id === optimistic.id ? saved : item)); setFeedback(`+${amount} ml`); }
    catch (error) { setWaterLogs((current) => current.filter((item) => item.id !== optimistic.id)); toast({ title: userSafeError(error, tt("sectionUnavailable")), variant: "error" }); }
    finally { setWaterPending(false); }
  }

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
      setFeedback(tt("mealSaved"));
    } catch (error) {
      toast({ title: tt("mealDoneFailed"), description: userSafeError(error), variant: "error" });
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
    try { const saved = items.length === 1 ? [await markDirectMealPlanItemSkipped(items[0])] : await markDirectMealPlanItemsSkipped(user.id, items.map((item) => item.id)); const byId = new Map(saved.map((item) => [item.id, item])); setMealItems((current) => current.map((item) => byId.get(item.id) ?? item)); setFeedback(tt("mealSkipped")); }
    catch (error) { setMealItems(previous); toast({ title: tt("mealSkipFailed"), description: userSafeError(error), variant: "error" }); }
    finally { setPendingMealIds((current) => { const next = new Set(current); ids.forEach((id) => next.delete(id)); return next; }); }
  }

  async function toggleBought(item: UserGroceryItem) {
    if (!user?.id || pendingGroceryIds.has(item.id)) return;
    const previous = groceryItems;
    setPendingGroceryIds((current) => new Set(current).add(item.id));
    setGroceryItems((current) => current.map((value) => value.id === item.id ? { ...value, checked: !item.checked } : value));
    try { const saved = await upsertGroceryItem(user.id, { ...item, checked: !item.checked }); setGroceryItems((current) => current.map((value) => value.id === item.id ? saved : value)); }
    catch (error) { setGroceryItems(previous); toast({ title: tt("groceryUpdateFailed"), description: userSafeError(error), variant: "error" }); }
    finally { setPendingGroceryIds((current) => { const next = new Set(current); next.delete(item.id); return next; }); }
  }

  return <div dir={dir}>
    <PageHeading title={`${tt("today")}${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`} description={`${localizedDate} · ${workoutData.day ? tt("trainingDay") : tt("restDay")}`} action={<Button type="button" className="hidden min-h-12 lg:inline-flex" onClick={() => openPrompts()}><OpenAiBlossom className="h-5 w-5" />{tt("askChatGpt")}</Button>} />
    {isInitialLoading ? <CardGridSkeleton count={4} rows={3} className="xl:grid-cols-4" /> : <div className="space-y-4">
      {Object.entries(errors).some(([, message]) => Boolean(message)) ? <div className="rounded-[14px] border border-warning/30 bg-warning/5 p-3" role="status"><p className="text-sm font-semibold">{tt("loadFailure")}</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(errors).filter(([, message]) => Boolean(message)).map(([source]) => <span key={source} className="rounded-full border border-warning/30 px-2 py-1 text-xs">{sourceLabel(source as SourceName, tt)}</span>)}</div></div> : null}
      {nutritionData.logsState === "failed" || nutritionData.totalsIncomplete ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-warning/30 bg-warning/5 p-3" role="alert"><div><p className="text-sm font-semibold">{tt("foodLogsUnavailable")}</p><p className="text-xs text-muted-foreground">{nutritionData.totalsIncomplete ? tt("foodTotalsIncomplete") : tt("foodLogsUnavailableDetail")}</p></div><Button type="button" size="sm" variant="outline" onClick={() => void retryFoodLogs()}>{tt("retryFoodLogs")}</Button></div> : null}

      {!setupDismissed && setupDone < setupChecklist.length ? <Card className="border-primary/20"><CardContent className="p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">{tt("completeSetup")}: {nextSetup?.label}</p><p className="text-xs text-muted-foreground">{setupDone}/{setupChecklist.length}</p></div><div className="flex items-center gap-2">{nextSetup ? <Button asChild size="sm"><Link href={nextSetup.href}>{nextSetup.label}</Link></Button> : null}<Button type="button" size="sm" variant="ghost" aria-expanded={setupExpanded} onClick={() => setSetupExpanded((value) => !value)}>{setupExpanded ? tt("hideDetails") : tt("showDetails")}{setupExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button><Button type="button" size="icon" variant="ghost" aria-label={tt("dismiss")} onClick={() => setSetupDismissed(true)}><X className="h-4 w-4" /></Button></div></div>{connection === "unknown" ? <p className="mt-2 rounded-[12px] border border-warning/25 bg-warning/5 p-2 text-xs text-muted-foreground">{tt("connectionUnknownDetail")}</p> : null}{setupExpanded ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{setupChecklist.map((item) => <Link key={item.label} href={item.href} className="flex min-h-11 items-center gap-2 rounded-[12px] border border-border/70 px-3 text-sm"><CheckCircle2 className={`h-4 w-4 ${item.done ? "text-primary" : "text-muted-foreground"}`} />{item.label}</Link>)}</div> : null}</CardContent></Card> : null}

      {primaryAction && primaryActionCopy ? <section aria-labelledby="today-now"><p id="today-now" className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{tt("now")}</p><Card className="border-primary/30 bg-primary/5"><CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]"><div><h2 className="text-xl font-semibold">{primaryActionCopy.title}</h2><p className="mt-1 text-sm text-muted-foreground">{primaryActionCopy.detail}</p></div>{primaryAction.waterAmountMl ? <Button type="button" disabled={waterPending} onClick={() => void addWater(primaryAction.waterAmountMl!)} className="min-h-12">{waterPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplets className="h-4 w-4" />}{primaryActionCopy.label}</Button> : primaryAction.href ? <Button asChild className="min-h-12"><Link href={primaryAction.href}>{primaryActionCopy.label}</Link></Button> : null}</CardContent></Card>{secondaryActionCopies.length ? <div className="mt-2 grid auto-rows-fr gap-2 sm:grid-cols-2">{secondaryActionCopies.map(({ action, copy }) => <Card key={action.id} className="h-full min-h-24"><CardContent className="flex h-full min-h-24 flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-semibold">{copy.title}</p><p className="text-xs text-muted-foreground">{copy.detail}</p></div>{action.waterAmountMl ? <Button type="button" size="sm" onClick={() => void addWater(action.waterAmountMl!)} className="min-h-11 w-full self-center shrink-0 sm:w-auto">{copy.label}</Button> : action.href ? <Button asChild size="sm" variant="outline" className="min-h-11 w-full self-center shrink-0 sm:w-auto"><Link href={action.href}>{copy.label}</Link></Button> : null}</CardContent></Card>)}</div> : null}</section> : null}

      <section aria-labelledby="today-progress">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="today-progress" className="text-base font-semibold">{tt("todayProgress")}</h2>
          {nutritionData.activeTarget?.hasTarget ? <span className="text-xs text-muted-foreground">{tt("targetLabel", { label: nutritionData.activeTarget.label })}</span> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ProgressMetric
            icon={<Flame className="h-5 w-5" />}
            label={tt("calories")}
            value={totals ? formatEnergy(totals.calories, settings.energyUnit) : tt("unavailable")}
            detail={targets ? `${formatEnergy(targets.daily_calories, settings.energyUnit)} ${tt("targetLabel", { label: "" }).trim()}` : nutritionData.targetsState === "failed" ? tt("targetUnavailable") : tt("noTarget")}
            progress={totals && targets?.daily_calories ? percent(totals.calories, targets.daily_calories) : undefined}
          />
          <ProgressMetric
            icon={<Soup className="h-5 w-5" />}
            label={tt("protein")}
            value={totals ? `${Math.round(totals.protein_g)} g` : tt("unavailable")}
            detail={targets?.protein_g ? `${Math.round(targets.protein_g)} g` : nutritionData.targetsState === "failed" ? tt("targetUnavailable") : tt("noTarget")}
            progress={totals && targets?.protein_g ? percent(totals.protein_g, targets.protein_g) : undefined}
          />
          <ProgressMetric icon={<Droplets className="h-5 w-5" />} label={tt("water")} value={formatLiquid(waterTotal, settings.liquidUnit)} detail={targets?.water_ml ? formatLiquid(targets.water_ml, settings.liquidUnit) : nutritionData.targetsState === "failed" ? tt("targetUnavailable") : tt("noTarget")} progress={targets?.water_ml ? percent(waterTotal, targets.water_ml) : undefined} />
          <ProgressMetric icon={<Dumbbell className="h-5 w-5" />} label={tt("workout")} value={workoutState === "active" ? tt("active") : workoutState === "completed" ? tt("completed") : workoutState === "scheduled" ? tt("notStarted") : tt("noWorkout")} detail={workoutData.day?.day_name ?? tt("restDay")} />
        </div>
      </section>

      <section aria-labelledby="today-plan"><h2 id="today-plan" className="mb-2 text-base font-semibold">{tt("todayPlan")}</h2><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Dumbbell className="h-5 w-5" />{tt("todaysWorkout")}</CardTitle></CardHeader><CardContent className="space-y-3">{workoutData.day ? <><div><p className="font-semibold">{workoutData.day.day_name}</p><p className="text-sm text-muted-foreground">{tt("exercisesCount", { count: workoutData.day.exercises.length })}{workoutData.plan?.session_duration_minutes ? ` · ${tt("durationMinutes", { minutes: workoutData.plan.session_duration_minutes })}` : ""}</p></div><div className="space-y-1">{workoutData.day.exercises.slice(0, 3).map((exercise) => <p key={exercise.id} className="text-sm text-muted-foreground">{exercise.sets ?? 1} × {exercise.reps ?? "?"} {exercise.exercise_name}</p>)}</div>{workoutCardHref ? <Button asChild variant="outline" className="min-h-12"><Link href={workoutCardHref}>{workoutState === "active" ? tt("resumeWorkout") : workoutState === "completed" ? tt("viewWorkout") : tt("startWorkout")}</Link></Button> : null}</> : <p className="text-sm text-muted-foreground">{tt("noWorkoutScheduled")}</p>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Utensils className="h-5 w-5" />{tt("todaysMeals")}</CardTitle></CardHeader><CardContent className="space-y-3">{relevantMeal ? <><div><p className="font-semibold">{mealTypeLabel(relevantMeal.meal_type, tt)}: {relevantMeal.food_name}</p><p className="text-sm text-muted-foreground">{Math.round(relevantMeal.calories)} kcal · {Math.round(relevantMeal.protein_g)} g {tt("protein")}</p></div><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void markMealDone(relevantMeal)} disabled={pendingMealIds.has(relevantMeal.id)} className="min-h-12"><Check className="h-4 w-4" />{pendingMealIds.has(relevantMeal.id) ? tt("saving") : tt("markDone")}</Button><Button type="button" variant="outline" onClick={() => void skipMealItems([relevantMeal])} disabled={pendingMealIds.has(relevantMeal.id)} className="min-h-12">{tt("skip")}</Button><Button type="button" variant="ghost" onClick={() => void skipMealItems(mealItems.filter((item) => item.status === "planned"))} disabled={!mealItems.some((item) => item.status === "planned")} className="min-h-12">{tt("skipAll")}</Button></div></> : mealItems.some((item) => item.status === "skipped") ? <p className="text-sm text-muted-foreground">{tt("skipped")}</p> : <p className="text-sm text-muted-foreground">{tt("noMealsPlanned")}</p>}<Button asChild variant="ghost" className="min-h-11"><Link href={`/my-meal-plan?tab=day&date=${today}`}>{tt("openMealPlan")}</Link></Button></CardContent></Card></div></section>

      <InlineFeedback message={feedback} onClose={() => setFeedback("")} />

      <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">{tt("quickLog")}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{enabledLogs.map((section) => <Button key={section} asChild variant="outline" className="min-h-12"><Link href={quickLogRoutes[section]}>{tt(quickLogLabels[section])}</Link></Button>)}{!enabledLogs.length ? <p className="text-sm text-muted-foreground">{tt("noQuickLogs")}</p> : null}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">{tt("wellnessToday")}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{todaySleep?.hours_slept ? `${tt("sleep")} ${todaySleep.hours_slept} h · ` : ""}{wellnessData.habits.filter((item) => !item.completed).length} {tt("habitsOpen")} · {wellnessData.supplements.filter((item) => !item.taken_today).length} {tt("supplementsOpen")}</p>{wellnessData.partialErrors.length ? <p className="text-xs text-warning">{tt("sectionUnavailable")}</p> : null}<p className="font-medium">{tt("checkInQuestion")}</p><DailyCheckins compact /></CardContent></Card></div>

      {groceryItems.length ? <Card className="lg:max-w-[calc(50%-0.5rem)]"><CardHeader className="cursor-pointer" onClick={() => setShoppingExpanded((value) => !value)}><button type="button" className="flex w-full items-center justify-between gap-3 text-start" aria-expanded={shoppingExpanded}><span><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-5 w-5" />{tt("shoppingList")}</CardTitle><span className="mt-1 block text-xs text-muted-foreground">{unbought.length} {tt("remaining")} · {bought.length} {tt("bought")}{alreadyHave.length ? ` · ${alreadyHave.length} ${tt("alreadyHave")}` : ""}</span></span>{shoppingExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</button></CardHeader>{shoppingExpanded ? <CardContent className="space-y-3"><div className="space-y-2">{unbought.slice(0, 6).map((item) => <label key={item.id} className="flex min-h-12 items-center gap-3 rounded-[12px] border border-border/70 px-3"><input type="checkbox" checked={item.checked} disabled={pendingGroceryIds.has(item.id)} onChange={() => void toggleBought(item)} className="h-5 w-5 accent-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.item_name}</span><span className="block text-xs text-muted-foreground">{item.quantity ?? ""} {item.unit ?? ""}</span></span></label>)}</div>{bought.length ? <div><button type="button" onClick={() => setBoughtExpanded((value) => !value)} className="flex min-h-11 items-center gap-2 text-sm font-semibold" aria-expanded={boughtExpanded}>{tt("boughtItems")}{boughtExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{boughtExpanded ? <div className="space-y-2">{bought.map((item) => <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-[12px] border border-border/70 px-3 opacity-75"><input type="checkbox" checked disabled={pendingGroceryIds.has(item.id)} onChange={() => void toggleBought(item)} className="h-5 w-5 accent-primary" /><span className="line-through">{item.item_name}</span></label>)}</div> : null}</div> : null}<Button asChild variant="outline" className="min-h-12"><Link href={`/my-meal-plan?tab=shopping&date=${today}`}>{tt("openFullGrocery")}</Link></Button></CardContent> : null}</Card> : null}


      {activitySourcesKnown && !currentActivity && !isInitialLoading ? <EmptyState title={tt("noActivityToday")} description={tt("noActivityDetail")} actionLabel={tt("quickLog")} actionHref="/calories" /> : null}
    </div>}
  </div>;
}

function ProgressMetric({ icon, label, value, detail, progress }: { icon: React.ReactNode; label: string; value: string; detail: string; progress?: number }) {
  return <Card><CardContent className="space-y-2 p-3 sm:p-4"><div className="flex items-center gap-2 text-primary">{icon}<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span></div><p className="text-lg font-bold sm:text-xl">{value}</p><p className="text-xs text-muted-foreground">{detail}</p>{progress !== undefined ? <Progress value={progress} /> : null}</CardContent></Card>;
}
