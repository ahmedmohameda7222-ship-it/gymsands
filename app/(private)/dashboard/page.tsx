"use client";

import { ArrowRight, CheckCircle2, Compass, Dumbbell, Droplets, Flame, Plus, Scale, Soup, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { PageHeading } from "@/components/layout/page-heading";
import { MetricCard } from "@/components/dashboard/metric-card";

import {
  ChecklistLine,
  CollapsibleSection,
  CompactSetupChecklist,
  WellnessSummary,
  buildWeeklyFocus,
  countCompletedTrainingStreak,
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
import { useUserSettings } from "@/lib/settings/user-settings-context";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function DashboardPage() {
  const { user, profile, session } = useAuth();
  const { settings } = useUserSettings();
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const today = useTodayDate();
  const isMobile = useIsMobile();
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [activeMealType, setActiveMealType] = useState<string | null>(null);

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

  const totals = useMemo(() => sumFoodLogs(logs), [logs]);
  const hasTargets = Boolean(targets);
  const remaining = targets ? remainingMacros({ calories: targets.daily_calories, protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g, water_ml: targets.water_ml }, totals) : { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const waterTotalMl = useMemo(() => waterLogs.reduce((sum, log) => sum + Number(log.amount_ml), 0), [waterLogs]);
  const latestProgress = progressEntries.at(-1) ?? null;
  const currentWeekday = getCurrentWeekday();
  const todayPlanDay = activePlan?.days.find((day) => day.weekday === currentWeekday && day.exercises.length > 0) ?? null;
  const todaySleepLog = sleepLogs.find((log) => log.log_date === today) ?? null;
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
    { label: "Connect ChatGPT import", done: chatGptConnected, href: "/settings/ai-imports", action: "Connect ChatGPT" },
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
  const todayPlanDayId = todayPlanDay?.id ?? null;
  const weeklyFocus = weeklyReport ? buildWeeklyFocus(weeklyReport) : null;
  const weeklyMetrics = weeklyReport ? reportMetrics(weeklyReport, "weekly").slice(0, 8) : [];
  const dashboardShortcuts = getDashboardShortcuts(todayPlanDayId);
  const visibleShortcuts = dashboardShortcuts.slice(0, 6);
  const closedTodayCount = [
    completedToday || !todayPlanDay,
    plannedMealsCount > 0 && doneMealsCount === plannedMealsCount,
    Boolean(targets?.protein_g && totals.protein_g >= targets.protein_g),
    Boolean(targets?.water_ml && waterTotalMl >= targets.water_ml),
    Boolean(latestProgress?.entry_date === today || todaySleepLog)
  ].filter(Boolean).length;
  const hasWellnessData = habits.length > 0 || supplements.length > 0 || sleepLogs.length > 0;

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

  const mealTypes = ["Breakfast", "Lunch", "Snack", "Dinner"] as const;
  const mealGroups = mealTypes.map((type) => ({
    type,
    items: mealPlanItems.filter((item) => item.meal_type === type)
  }));
  const firstIncompleteMeal = mealGroups.find((group) => group.items.length > 0 && !group.items.every((item) => item.status === "done" || skippedIds.has(item.id)));
  const currentMealType = activeMealType ?? firstIncompleteMeal?.type ?? null;

  function skipFood(itemId: string) {
    setSkippedIds((prev) => new Set(prev).add(itemId));
  }

  function skipMeal(mealType: string) {
    const items = mealGroups.find((g) => g.type === mealType)?.items ?? [];
    setSkippedIds((prev) => {
      const next = new Set(prev);
      items.forEach((item) => next.add(item.id));
      return next;
    });
  }

  return (
    <>
      <WelcomePopup />
      <PageHeading
        title={`Today${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description="Your daily plan for training, food, hydration, and progress."
        action={
          <div className="hidden sm:flex sm:flex-row sm:gap-2">
            <Button asChild>
              <Link href="/calories">
                <Plus className="h-4 w-4" />
                Log Food
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/my-workout/plans">Import or Start Workout</Link>
            </Button>
          </div>
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
          description="Start by logging food, adding water, importing a workout plan, or saving a progress entry."
          actionLabel="Log food"
          actionHref="/calories"
          secondaryLabel="Import workout plan"
          secondaryHref="/my-workout/plans"
          className="mb-4"
        />
      ) : null}

      {!isLoading && !loadError ? (
        <div className="space-y-3 sm:space-y-4">
          {setupCompletedCount < setupChecklist.length ? (
            <CompactSetupChecklist
              checklist={setupChecklist}
              nextItem={nextSetupItem}
              completedCount={setupCompletedCount}
              totalCount={setupChecklist.length}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {!settings.hideCaloriesOnDashboard ? (
              <MetricCard icon={Flame} label="Calories" value={`${totals.calories} kcal`} detail={hasTargets ? `${remaining.calories} kcal left` : "No target"} progress={targets?.daily_calories ? percent(totals.calories, targets.daily_calories) : undefined} />
            ) : null}
            <MetricCard icon={Soup} label="Protein" value={`${totals.protein_g}g`} detail={hasTargets ? `${remaining.protein_g}g left` : "Set target"} progress={targets?.protein_g ? percent(totals.protein_g, targets.protein_g) : undefined} />
            <MetricCard icon={Droplets} label="Water" value={waterTotalMl ? `${waterLiters} L` : "No water"} detail={targets?.water_ml ? `${waterTargetLiters} L target` : "Set target"} progress={targets?.water_ml ? percent(waterTotalMl, targets.water_ml) : undefined} />
            {!settings.hideBodyWeightOnDashboard ? (
              <MetricCard icon={Scale} label="Weight" value={latestProgress?.body_weight_kg ? `${latestProgress.body_weight_kg} kg` : "No entry"} detail={latestProgress ? `Last ${latestProgress.entry_date}` : "Add progress"} />
            ) : null}
          </div>

          {activePlan ? (
            todayPlanDay ? (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Dumbbell className="h-5 w-5 shrink-0 text-primary" />
                        <p className="font-semibold">{todayPlanDay.day_name}</p>
                        <span className="text-xs text-muted-foreground">{today}</span>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {todayPlanDay.exercises.slice(0, 5).map((ex, index) => (
                          <p key={index} className="text-sm text-muted-foreground">
                            {ex.sets ?? 1} × {ex.reps ?? "?"} {ex.exercise_name}
                          </p>
                        ))}
                        {todayPlanDay.exercises.length > 5 && (
                          <p className="text-xs text-muted-foreground">+{todayPlanDay.exercises.length - 5} more</p>
                        )}
                      </div>
                    </div>
                    {completedToday ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done
                      </span>
                    ) : openSessionId ? (
                      <Button asChild size="sm">
                        <Link href={`/workouts/session/${openSessionId}`}>Resume</Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm">
                        <Link href={`/workouts/session/day/${todayPlanDay.id}`}>Start</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <Dumbbell className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-semibold text-muted-foreground">Rest day</p>
                      <p className="text-sm text-muted-foreground">No workout scheduled for today. Recover well.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          ) : (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <Dumbbell className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-muted-foreground">No workout planned</p>
                    <p className="text-sm text-muted-foreground">Import a plan to see today&apos;s workout here.</p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/my-workout/plans">Import plan</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {mealPlanItems.length > 0 ? (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-primary" />
                  <p className="font-semibold">Today&apos;s meal plan</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mealGroups.filter((group) => group.items.length > 0).map((group) => {
                    const allDone = group.items.every((item) => item.status === "done" || skippedIds.has(item.id));
                    return (
                      <Button
                        key={group.type}
                        type="button"
                        variant={currentMealType === group.type ? "default" : allDone ? "ghost" : "outline"}
                        size="sm"
                        onClick={() => setActiveMealType(group.type)}
                      >
                        {group.type}
                        {allDone && <CheckCircle2 className="ml-1 h-3.5 w-3.5" />}
                      </Button>
                    );
                  })}
                </div>

                {currentMealType ? (
                  <div className="mt-4 space-y-3">
                    {mealGroups
                      .find((g) => g.type === currentMealType)
                      ?.items.filter((item) => item.status !== "done" && !skippedIds.has(item.id))
                      .map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-slate-50 p-3">
                          <div className="min-w-0">
                            <p className="font-medium">{item.food_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.calories} kcal · {item.protein_g}g protein · {item.carbs_g}g carbs · {item.fat_g}g fat
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => skipFood(item.id)}>
                              Skip
                            </Button>
                            <Button type="button" size="sm" onClick={() => quickMarkMealDone(item)}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Done
                            </Button>
                          </div>
                        </div>
                      ))}

                    {mealGroups.find((g) => g.type === currentMealType)?.items.every((item) => item.status === "done" || skippedIds.has(item.id)) ? (
                      <p className="text-center text-sm text-muted-foreground">
                        All {currentMealType.toLowerCase()} items completed. {firstIncompleteMeal ? `Next: ${firstIncompleteMeal.type}` : "All meals done."}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-center text-sm text-muted-foreground">All meals completed today.</p>
                )}

                {currentMealType && mealGroups.find((g) => g.type === currentMealType)?.items.some((item) => item.status !== "done" && !skippedIds.has(item.id)) ? (
                  <Button type="button" variant="ghost" size="sm" className="mt-3 w-full" onClick={() => skipMeal(currentMealType)}>
                    Skip all {currentMealType.toLowerCase()}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="rounded-md border border-border/70 bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Quick links</p>
            <div className="flex flex-wrap gap-2">
              {visibleShortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <Button key={shortcut.href} asChild variant="outline" size="sm">
                    <Link href={shortcut.href}>
                      <Icon className="h-3.5 w-3.5" />
                      {shortcut.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>

          {hasWellnessData ? (
            <CollapsibleSection
              title="Wellness summary"
              preview={`${habits.length} habits · ${supplements.length} supplements · ${sleepLogs.length} sleep logs`}
              defaultOpen={!isMobile}
            >
              <WellnessSummary habits={habits} supplements={supplements} sleepLogs={sleepLogs} />
            </CollapsibleSection>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
