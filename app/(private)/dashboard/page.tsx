"use client";

import { ArrowRight, CheckCircle2, Compass, Droplets, Flame, Plus, Scale, Soup } from "lucide-react";
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
  CollapsibleSection,
  CompactRecentActivity,
  CompactSetupChecklist,
  MacroLine,
  QuickLinkGrid,
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

  const nutritionPreview = targets
    ? `${Math.round(percent(totals.protein_g, targets.protein_g))}% protein · ${waterLiters} L water`
    : "Set targets to unlock full snapshot";
  const progressPreview = `${todayScore}% today · ${closedTodayCount}/5 closed · ${trainingStreak} day streak`;
  const activityPreview = logs.length > 0 || history.length > 0
    ? `${logs.length} meal${logs.length === 1 ? "" : "s"} · ${history.length} workout${history.length === 1 ? "" : "s"}`
    : "No recent activity";
  const weeklyPreview = weeklyReport ? `${weeklyMetrics.filter((m) => !m.empty).length} metrics tracked` : "No weekly data";

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
            <MetricCard icon={Flame} label="Calories" value={`${totals.calories} kcal`} detail={hasTargets ? `${remaining.calories} kcal left` : "No target"} progress={targets?.daily_calories ? percent(totals.calories, targets.daily_calories) : undefined} />
            <MetricCard icon={Soup} label="Protein" value={`${totals.protein_g}g`} detail={hasTargets ? `${remaining.protein_g}g left` : "Set target"} progress={targets?.protein_g ? percent(totals.protein_g, targets.protein_g) : undefined} />
            <MetricCard icon={Droplets} label="Water" value={waterTotalMl ? `${waterLiters} L` : "No water"} detail={targets?.water_ml ? `${waterTargetLiters} L target` : "Set target"} progress={targets?.water_ml ? percent(waterTotalMl, targets.water_ml) : undefined} />
            <MetricCard icon={Scale} label="Weight" value={latestProgress?.body_weight_kg ? `${latestProgress.body_weight_kg} kg` : "No entry"} detail={latestProgress ? `Last ${latestProgress.entry_date}` : "Add progress"} />
          </div>

          <Card>
            <CardHeader className="p-4 sm:p-5">
              <CardTitle>Quick links</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
              <QuickLinkGrid shortcuts={visibleShortcuts} />
            </CardContent>
          </Card>

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
