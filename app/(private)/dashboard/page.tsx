"use client";

import { ArrowRight, Brain, CalendarCheck, CheckCircle2, Compass, Droplets, Dumbbell, Flame, Plus, Scale, Soup } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { PageHeading } from "@/components/layout/page-heading";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import {
  ChecklistLine,
  MacroLine,
  RingMetric,
  SmartActionCard,
  buildDashboardCoaching,
  buildNextBestActions,
  buildWeeklyFocus,
  countCompletedTrainingStreak,
  defaultShortcutKeys,
  getDashboardShortcuts
} from "@/components/dashboard/dashboard-sections";
import { WelcomePopup } from "@/components/dashboard/welcome-popup";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOnboarding } from "@/services/database/profile";
import {
  addWaterLog,
  getCalorieTargets,
  getNutritionWeek,
  getTodayFoodLogs,
  getTodayMealPlanItems,
  getWaterLogs,
  markMealPlanItemDone
} from "@/services/database/nutrition";
import { getPersonalRecords, getProgressEntries } from "@/services/database/progress";
import { getFitnessHabits, getSleepRecoveryLogs, getSupplementLogs } from "@/services/database/wellness";
import { getCurrentWeekday, getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getOpenWorkoutDaySession, getWorkoutActivity, getWorkoutHistory } from "@/services/database/workout-sessions";
import { percent, remainingMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import type { SavedTargets } from "@/services/nutrition/targets";
import { aggregateReport, buildWeekRange, reportMetrics, startOfWeek, type AggregatedReport } from "@/services/reports/reporting";
import { getFitnessHabitHistory, getSleepRecoveryHistory } from "@/services/wellness/wellness-data";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import type { FitnessHabit, FoodLog, MealPlanItem, ProgressEntry, SleepRecoveryLog, SupplementLog, UserWorkoutPlan, WaterLog, WorkoutSession } from "@/types";

export default function DashboardPage() {
  const { user, profile, session } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [mealPlanItems, setMealPlanItems] = useState<MealPlanItem[]>([]);
  const [activePlan, setActivePlan] = useState<UserWorkoutPlan | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [habits, setHabits] = useState<FitnessHabit[]>([]);
  const [supplements, setSupplements] = useState<SupplementLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepRecoveryLog[]>([]);
  const [targets, setTargets] = useState<SavedTargets | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<AggregatedReport | null>(null);
  const [chatGptConnected, setChatGptConnected] = useState(false);
  const [shortcutKeys, setShortcutKeys] = useState<string[]>(defaultShortcutKeys);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const today = useTodayDate();

  async function loadDashboard() {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setLoadErrorDetails(undefined);
    try {
      const weekRange = buildWeekRange(today);
      const [
        foodLogs,
        workoutHistory,
        dailyWater,
        progress,
        plannedMeals,
        plan,
        calorieTargets,
        supplementLogs,
        recoveryLogs,
        onboarding,
        todayHabits,
        weekNutrition,
        workoutActivity,
        habitHistory,
        sleepHistory,
        personalRecords
      ] = await Promise.all([
        getTodayFoodLogs(user.id),
        getWorkoutHistory(user.id),
        getWaterLogs(user.id, today),
        getProgressEntries(user.id),
        getTodayMealPlanItems(user.id),
        getDefaultUserWorkoutPlan(user.id),
        getCalorieTargets(user.id),
        getSupplementLogs(user.id),
        getSleepRecoveryLogs(user.id, 7),
        getOnboarding(user.id),
        getFitnessHabits(user.id, today),
        getNutritionWeek(user.id, startOfWeek(today)),
        getWorkoutActivity(user.id, 180),
        getFitnessHabitHistory(user.id, 30),
        getSleepRecoveryHistory(user.id, 30),
        getPersonalRecords(user.id, 30)
      ]);

      if (!onboarding) {
        router.replace("/onboarding");
        return;
      }

      setLogs(foodLogs);
      setHistory(workoutHistory);
      setWaterLogs(dailyWater);
      setProgressEntries(progress);
      setMealPlanItems(plannedMeals);
      setActivePlan(plan);
      setTargets(calorieTargets);
      setHabits(todayHabits);
      setSupplements(supplementLogs);
      setSleepLogs(recoveryLogs);
      setWeeklyReport(aggregateReport({ range: weekRange, nutrition: weekNutrition, workouts: workoutActivity, progressEntries: progress, habits: habitHistory, sleepLogs: sleepHistory, personalRecords }));
      const todayDay = plan?.days.find((day) => day.weekday === getCurrentWeekday() && day.exercises.length > 0) ?? null;
      const open = todayDay ? await getOpenWorkoutDaySession(user.id, todayDay.id) : null;
      setOpenSessionId(open?.id ?? null);
      if (session?.access_token) {
        fetch("/api/mcp/connections", { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then((response) => response.ok ? response.json() : null)
          .then((data) => {
            const connections = Array.isArray(data?.connections) ? data.connections : [];
            setChatGptConnected(connections.some((connection: { is_active?: boolean; revoked_at?: string | null }) => connection.is_active && !connection.revoked_at));
          })
          .catch(() => setChatGptConnected(false));
      } else {
        setChatGptConnected(false);
      }
    } catch (error) {
      logRecoverableError("dashboard.load", error);
      const message = userSafeError(error, "Today's overview could not be loaded. Retry to reload your real saved data.");
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: "Could not load today's overview", description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem("fitlife-dashboard-shortcuts") || "null") as string[] | null;
      if (Array.isArray(saved) && saved.length) setShortcutKeys(saved);
    } catch {
      setShortcutKeys(defaultShortcutKeys);
    }
  }, []);

  const totals = useMemo(() => sumFoodLogs(logs), [logs]);
  const hasTargets = Boolean(targets);
  const remaining = targets ? remainingMacros({ calories: targets.daily_calories, protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g, water_ml: targets.water_ml }, totals) : { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const waterTotalMl = useMemo(() => waterLogs.reduce((sum, log) => sum + Number(log.amount_ml), 0), [waterLogs]);
  const latestProgress = progressEntries.at(-1) ?? null;
  const currentWeekday = getCurrentWeekday();
  const todayPlanDay = activePlan?.days.find((day) => day.weekday === currentWeekday && day.exercises.length > 0) ?? null;
  const todaySleepLog = sleepLogs.find((log) => log.log_date === today) ?? null;
  const supplementsTaken = supplements.length > 0 && supplements.every((item) => item.taken_today);
  const plannedMealsCount = mealPlanItems.length;
  const doneMealsCount = mealPlanItems.filter((item) => item.status === "done").length;
  const waterLiters = Math.round((waterTotalMl / 1000) * 10) / 10;
  const waterTargetLiters = Math.round(((targets?.water_ml ?? 0) / 1000) * 10) / 10;
  const hasAnyTodayData = logs.length > 0 || history.length > 0 || waterLogs.length > 0 || progressEntries.length > 0 || mealPlanItems.length > 0 || Boolean(activePlan) || supplements.length > 0 || sleepLogs.length > 0 || Boolean(targets);
  const completedToday = Boolean(history.find((session) => session.status === "completed" && (session.completed_at?.slice(0, 10) === today || session.started_at?.slice(0, 10) === today)));
  const hasStartedWorkout = Boolean(openSessionId || history.some((session) => session.status === "completed"));
  const setupChecklist = [
    { label: "Finish profile", done: Boolean(profile?.full_name), href: "/profile", action: "Edit profile" },
    { label: "Set calorie and water targets", done: hasTargets, href: "/calories", action: "Set targets" },
    { label: "Connect ChatGPT import", done: chatGptConnected, href: "/settings", action: "Connect ChatGPT" },
    { label: "Import workout plan", done: Boolean(activePlan), href: "/my-workout/plans", action: "Import plan" },
    { label: "Add meal plan or log first meal", done: mealPlanItems.length > 0 || logs.length > 0, href: "/my-meal-plan", action: "Plan meal" },
    { label: "Add first progress entry", done: progressEntries.length > 0, href: "/progress", action: "Add progress" },
    { label: "Start first workout", done: hasStartedWorkout, href: todayPlanDay ? `/workouts/session/day/${todayPlanDay.id}` : "/my-workout/plans", action: "Start workout" }
  ];
  const nextSetupItem = setupChecklist.find((item) => !item.done) ?? null;
  const setupCompletedCount = setupChecklist.filter((item) => item.done).length;
  const todayScoreChecks = [
    logs.length > 0,
    Boolean(targets?.protein_g && totals.protein_g >= targets.protein_g),
    Boolean(targets?.water_ml && waterTotalMl >= targets.water_ml),
    completedToday,
    Boolean(latestProgress?.entry_date === today || todaySleepLog)
  ];
  const todayScore = Math.round((todayScoreChecks.filter(Boolean).length / todayScoreChecks.length) * 100);
  const trainingStreak = countCompletedTrainingStreak(history);
  const visualSignals = [
    { label: "Today score", value: `${todayScore}%`, detail: "Food, protein, water, training, and recovery/progress", progress: todayScore, icon: CheckCircle2 },
    { label: "Training streak", value: `${trainingStreak} day${trainingStreak === 1 ? "" : "s"}`, detail: "Consecutive completed workout days from real history", progress: Math.min(100, trainingStreak * 20), icon: Dumbbell },
    { label: "Protein", value: targets?.protein_g ? `${Math.min(100, percent(totals.protein_g, targets.protein_g))}%` : "Set target", detail: targets?.protein_g ? `${Math.max(0, remaining.protein_g)}g left today` : "Save a protein target to track adherence", progress: targets?.protein_g ? percent(totals.protein_g, targets.protein_g) : 0, icon: Soup },
    { label: "Water", value: targets?.water_ml ? `${Math.min(100, percent(waterTotalMl, targets.water_ml))}%` : "Set target", detail: targets?.water_ml ? `${Math.max(0, targets.water_ml - waterTotalMl)} ml left today` : "Save a water target to track streaks", progress: targets?.water_ml ? percent(waterTotalMl, targets.water_ml) : 0, icon: Droplets }
  ];
  const todayPlanDayId = todayPlanDay?.id ?? null;
  const smartActions = buildNextBestActions({
    logs,
    targets,
    totals,
    remaining,
    waterTotalMl,
    mealPlanItems,
    habits,
    todayPlanDayId,
    activePlanId: activePlan?.id ?? null,
    openSessionId,
    completedToday,
    latestProgressDate: latestProgress?.entry_date ?? null,
    sleepLoggedToday: Boolean(todaySleepLog),
    supplements,
    today
  });
  const weeklyFocus = weeklyReport ? buildWeeklyFocus(weeklyReport) : null;
  const weeklyMetrics = weeklyReport ? reportMetrics(weeklyReport, "weekly").slice(0, 8) : [];
  const dashboardShortcuts = getDashboardShortcuts(todayPlanDayId);
  const visibleShortcuts = dashboardShortcuts.filter((shortcut) => shortcutKeys.includes(shortcut.key));
  const dashboardCoaching = buildDashboardCoaching({
    hasTargets,
    targets,
    totals,
    remaining,
    waterTotalMl,
    plannedMealsCount,
    doneMealsCount,
    todayPlanDay: Boolean(todayPlanDay),
    completedToday,
    latestProgressDate: latestProgress?.entry_date ?? null,
    sleepLoggedToday: Boolean(todaySleepLog),
    todayIso: today
  });

  async function quickMarkMealDone(item: MealPlanItem) {
    if (!user?.id) return;
    try {
      const result = await markMealPlanItemDone(item);
      setMealPlanItems((current) => current.map((meal) => (meal.id === result.item.id ? result.item : meal)));
      if (result.log) setLogs((current) => [result.log as FoodLog, ...current]);
      toast({ title: result.already_done ? "Meal already done" : "Meal marked done", description: result.already_done ? "No duplicate food log was created." : `${item.food_name} was added to Food Log.` });
    } catch (error) {
      logRecoverableError("dashboard.meal-done", error);
      toast({ title: "Could not mark meal done", description: userSafeError(error, "The meal was not logged. Retry when the connection is stable.") });
    }
  }

  async function quickAddWater(amountMl: number) {
    if (!user?.id) return;
    try {
      const log = await addWaterLog(user.id, today, amountMl);
      setWaterLogs((current) => [log, ...current]);
    } catch (error) {
      logRecoverableError("dashboard.water", error);
      toast({ title: "Could not add water", description: userSafeError(error, "Water was not logged. Retry without adding duplicate entries.") });
    }
  }

  function toggleShortcut(key: string) {
    setShortcutKeys((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];
      const safeNext = next.length ? next : defaultShortcutKeys;
      if (typeof window !== "undefined") window.localStorage.setItem("fitlife-dashboard-shortcuts", JSON.stringify(safeNext));
      return safeNext;
    });
  }

  return (
    <>
      <WelcomePopup />
      <PageHeading
        title={`Today${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description="Your daily command center for workouts, meals, calories, water, and progress. No placeholder health data is shown."
        action={
          <>
            <Button asChild>
              <Link href="/calories">
                <Plus className="h-4 w-4" />
                Log Food
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/my-workout/plans">Import or Start Workout</Link>
            </Button>
          </>
        }
      />

      {isLoading ? <CardGridSkeleton count={4} rows={3} className="xl:grid-cols-4" /> : null}

      {!isLoading && loadError ? (
        <ErrorState
          title="Today could not load"
          description={loadError}
          onRetry={loadDashboard}
          fallbackLabel="Open settings"
          fallbackHref="/settings"
          details={loadErrorDetails}
        />
      ) : null}

      {!isLoading && !loadError && !hasAnyTodayData ? (
        <EmptyState
          title="No activity saved for today yet"
          description="Start by importing a ChatGPT workout plan, logging food, adding water, or saving a progress entry. No fake dashboard numbers are shown."
          actionLabel="Log food"
          actionHref="/calories"
          secondaryLabel="Import workout plan"
          secondaryHref="/my-workout/plans"
          className="mb-4"
        />
      ) : null}

      {!isLoading && !loadError ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Flame} label="Calories eaten" value={`${totals.calories} kcal`} detail={hasTargets ? `${remaining.calories} kcal remaining` : "No calorie target set"} progress={targets?.daily_calories ? percent(totals.calories, targets.daily_calories) : undefined} />
            <MetricCard icon={Soup} label="Protein" value={`${totals.protein_g}g`} detail={hasTargets ? `${remaining.protein_g}g remaining` : "Set protein target"} progress={targets?.protein_g ? percent(totals.protein_g, targets.protein_g) : undefined} />
            <MetricCard icon={Droplets} label="Water intake" value={waterTotalMl ? `${waterLiters} L` : "No water logged"} detail={targets?.water_ml ? `Target ${waterTargetLiters} L today` : "Set water target"} progress={targets?.water_ml ? percent(waterTotalMl, targets.water_ml) : undefined} />
            <MetricCard icon={Scale} label="Current weight" value={latestProgress?.body_weight_kg ? `${latestProgress.body_weight_kg} kg` : "No progress entry"} detail={latestProgress ? `Latest entry ${latestProgress.entry_date}` : "Add your first progress entry"} />
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Command center</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visualSignals.map((signal) => (
                <RingMetric key={signal.label} {...signal} />
              ))}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Next best action
              </CardTitle>
              <p className="text-sm text-muted-foreground">Ranked from real saved targets, food logs, water, imported workouts, progress, supplements, and recovery logs.</p>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-3">
              {smartActions.map((item) => (
                <SmartActionCard key={item.label} item={item} onAddWater={quickAddWater} />
              ))}
            </CardContent>
          </Card>

          {weeklyReport ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Compass className="h-5 w-5 text-primary" />
                  Weekly review
                </CardTitle>
                <p className="text-sm text-muted-foreground">Beginner-friendly summary from this week's saved workouts, food logs, water, progress, habits, sleep, and PRs.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {weeklyFocus ? (
                  <div className="rounded-md border bg-primary/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Suggested focus next week</p>
                    <p className="mt-1 font-semibold">{weeklyFocus.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{weeklyFocus.detail}</p>
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {weeklyMetrics.map((metric) => (
                    <div key={metric.label} className={`rounded-md border p-3 ${metric.empty ? "border-dashed bg-muted/30" : "bg-card"}`}>
                      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{metric.label}</p>
                      <p className="mt-1 font-semibold">{metric.value}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{metric.detail}</p>
                    </div>
                  ))}
                </div>
                <Button asChild variant="outline">
                  <Link href="/calories/weekly-overview">
                    Open full weekly report
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-primary" />
                Today's coaching details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {dashboardCoaching.map((item) => (
                <div key={item.label} className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{item.label}</p>
                  <p className="mt-1 font-semibold">{item.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {setupCompletedCount < setupChecklist.length ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Start here
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
                  <div>
                    <p className="font-semibold">{nextSetupItem ? `Next: ${nextSetupItem.label}` : "Setup complete"}</p>
                    <p className="text-sm text-muted-foreground">{setupCompletedCount}/{setupChecklist.length} setup steps complete from real saved account data.</p>
                  </div>
                  {nextSetupItem ? (
                    <Button asChild>
                      <Link href={nextSetupItem.href}>{nextSetupItem.action}</Link>
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {setupChecklist.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="flex min-h-14 items-center justify-between gap-3 rounded-md border p-3 text-sm font-medium transition hover:border-primary hover:bg-muted"
                    >
                      <span>{item.label}</span>
                      <span className={item.done ? "text-primary" : "text-muted-foreground"}>{item.done ? "Done" : item.action}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" />Today's plan</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-sm font-semibold text-muted-foreground">Workout</p>
                  {activePlan ? (
                    <>
                      <p className="mt-1 font-semibold">{todayPlanDay ? todayPlanDay.day_name : `${currentWeekday} rest day`}</p>
                      <p className="text-sm text-muted-foreground">{activePlan.name}</p>
                      <Button asChild className="mt-3" size="sm"><Link href={todayPlanDay ? `/workouts/session/day/${todayPlanDay.id}` : `/my-workout/plans/${activePlan.id}`}><Dumbbell className="h-4 w-4" />{openSessionId ? "Resume Workout" : todayPlanDay ? "Start Today's Workout" : "View Active Plan"}</Link></Button>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 font-semibold">No workout plan active</p>
                      <p className="text-sm text-muted-foreground">Import a ChatGPT plan or create a manual plan.</p>
                      <Button asChild className="mt-3" size="sm"><Link href="/my-workout/plans">Import Workout Plan</Link></Button>
                    </>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-sm font-semibold text-muted-foreground">Meals</p>
                  <p className="mt-1 font-semibold">{doneMealsCount}/{plannedMealsCount} planned meals done</p>
                  <p className="text-sm text-muted-foreground">{plannedMealsCount ? "Planned meals only count after they are marked done." : "No meals planned for today."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {mealPlanItems.filter((item) => item.status !== "done").slice(0, 2).map((item) => <Button key={item.id} type="button" size="sm" onClick={() => quickMarkMealDone(item)}><CheckCircle2 className="h-4 w-4" />Mark {item.meal_type} done</Button>)}
                    <Button asChild size="sm" variant="outline"><Link href="/my-meal-plan">Manage Meal Plan</Link></Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleShortcuts.map((shortcut) => {
                    const Icon = shortcut.icon;
                    return (
                      <Button key={shortcut.key} asChild variant="outline">
                        <Link href={shortcut.href}>
                          <Icon className="h-4 w-4" />
                          {shortcut.label}
                        </Link>
                      </Button>
                    );
                  })}
                </div>
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-sm font-semibold">Customize shortcuts</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {dashboardShortcuts.map((shortcut) => (
                      <label key={shortcut.key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={shortcutKeys.includes(shortcut.key)} onChange={() => toggleShortcut(shortcut.key)} />
                        <span>{shortcut.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader><CardTitle>Water quick add</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {[250, 500, 750, 1000].map((amount) => <Button key={amount} type="button" variant="outline" onClick={() => quickAddWater(amount)}><Droplets className="h-4 w-4" />+{amount === 1000 ? "1 L" : `${amount} ml`}</Button>)}
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Macros today</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {targets ? <><MacroLine label="Protein" value={totals.protein_g} target={targets.protein_g} /><MacroLine label="Carbs" value={totals.carbs_g} target={targets.carbs_g} /><MacroLine label="Fat" value={totals.fat_g} target={targets.fat_g} /></> : <div className="rounded-md border p-3 text-sm text-muted-foreground">No calorie or macro targets set. Open Calories/Macros or Profile & Goals to save your targets.</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Daily checklist</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <ChecklistLine label="Workout" done={completedToday} emptyLabel={todayPlanDay ? "Not completed yet" : "Rest day or no active plan"} />
                <ChecklistLine label="Meals" done={plannedMealsCount > 0 && doneMealsCount === plannedMealsCount} emptyLabel={plannedMealsCount ? `${plannedMealsCount - doneMealsCount} planned meals left` : "No meals planned"} />
                <ChecklistLine label="Protein" done={Boolean(targets?.protein_g && totals.protein_g >= targets.protein_g)} emptyLabel={targets?.protein_g ? `${remaining.protein_g}g remaining` : "Set protein target"} />
                <ChecklistLine label="Water" done={Boolean(targets?.water_ml && waterTotalMl >= targets.water_ml)} emptyLabel={targets?.water_ml ? (waterTotalMl ? `${Math.max(0, targets.water_ml - waterTotalMl)} ml remaining` : "No water logged today") : "Set water target"} />
                <ChecklistLine label="Supplements" done={supplementsTaken} emptyLabel={supplements.length ? "Supplements still open" : "No supplements scheduled"} />
                <ChecklistLine label="Sleep/recovery" done={Boolean(todaySleepLog)} emptyLabel="No sleep/recovery log today" />
                <ChecklistLine label="Progress" done={Boolean(latestProgress?.entry_date === today)} emptyLabel="No progress entry today" />
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Recent meals</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {logs.slice(0, 4).map((log) => <div key={log.id} className="rounded-md border p-3"><p className="font-semibold">{log.food_name}</p><p className="text-sm text-muted-foreground">{log.calories} kcal | {log.protein_g}g protein</p></div>)}
                {!logs.length ? <p className="text-sm text-muted-foreground">No meals logged yet.</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent workouts</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {history.slice(0, 4).map((session) => <div key={session.id} className="rounded-md border p-3"><p className="font-semibold">{session.workout_name}</p><p className="text-sm text-muted-foreground">{session.status} | {session.duration_minutes ?? 0} minutes</p></div>)}
                {!history.length ? <p className="text-sm text-muted-foreground">No workouts logged yet.</p> : null}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4">
            {logs.length ? <DashboardCharts macros={totals} /> : <EmptyState title="Not enough data for charts" description="Charts appear after you log real meals. No fake macro chart is shown when there is no food log data." actionLabel="Log food" actionHref="/calories" />}
          </div>
        </>
      ) : null}
    </>
  );
}

