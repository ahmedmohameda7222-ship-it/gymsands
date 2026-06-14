"use client";

import Link from "next/link";
import { Activity, CalendarCheck, CheckCircle2, Droplets, Dumbbell, Flame, Plus, Scale, Soup, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeading } from "@/components/layout/page-heading";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { WelcomePopup } from "@/components/dashboard/welcome-popup";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import {
  addWaterLog,
  getCalorieTargets,
  getCurrentWeekday,
  getDefaultUserWorkoutPlan,
  getOpenWorkoutDaySession,
  getProgressEntries,
  getSleepRecoveryLogs,
  getSupplementLogs,
  getTodayFoodLogs,
  getTodayMealPlanItems,
  getWaterLogs,
  getWorkoutHistory,
  markMealPlanItemDone
} from "@/services/database/repository";
import { percent, remainingMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import { targetOrSetupDefault, type SavedTargets } from "@/services/nutrition/targets";
import { todayIso } from "@/lib/utils";
import type { FoodLog, MealPlanItem, ProgressEntry, SleepRecoveryLog, SupplementLog, UserWorkoutPlan, WaterLog, WorkoutSession } from "@/types";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [mealPlanItems, setMealPlanItems] = useState<MealPlanItem[]>([]);
  const [activePlan, setActivePlan] = useState<UserWorkoutPlan | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [supplements, setSupplements] = useState<SupplementLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepRecoveryLog[]>([]);
  const [targets, setTargets] = useState<SavedTargets | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) return;

    setIsLoading(true);
    Promise.all([
      getTodayFoodLogs(user.id),
      getWorkoutHistory(user.id),
      getWaterLogs(user.id, todayIso()),
      getProgressEntries(user.id),
      getTodayMealPlanItems(user.id),
      getDefaultUserWorkoutPlan(user.id),
      getCalorieTargets(user.id),
      getSupplementLogs(user.id),
      getSleepRecoveryLogs(user.id, 7)
    ])
      .then(async ([foodLogs, workoutHistory, dailyWater, progress, plannedMeals, plan, calorieTargets, supplementLogs, recoveryLogs]) => {
        if (!active) return;
        setLogs(foodLogs);
        setHistory(workoutHistory);
        setWaterLogs(dailyWater);
        setProgressEntries(progress);
        setMealPlanItems(plannedMeals);
        setActivePlan(plan);
        setTargets(calorieTargets);
        setSupplements(supplementLogs);
        setSleepLogs(recoveryLogs);
        const todayDay = plan?.days.find((day) => day.weekday === getCurrentWeekday() && day.exercises.length > 0) ?? null;
        const open = todayDay ? await getOpenWorkoutDaySession(user.id, todayDay.id) : null;
        if (active) setOpenSessionId(open?.id ?? null);
      })
      .catch((error) =>
        toast({
          title: "Could not load today's overview",
          description: error instanceof Error ? error.message : "Refresh the page and try again."
        })
      )
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [toast, user]);

  const totals = useMemo(() => sumFoodLogs(logs), [logs]);
  const hasTargets = Boolean(targets);
  const displayTargets = targetOrSetupDefault(targets);
  const remaining = remainingMacros(
    {
      calories: displayTargets.daily_calories,
      protein_g: displayTargets.protein_g,
      carbs_g: displayTargets.carbs_g,
      fat_g: displayTargets.fat_g,
      water_ml: displayTargets.water_ml
    },
    totals
  );
  const waterTotalMl = useMemo(() => waterLogs.reduce((sum, log) => sum + Number(log.amount_ml), 0), [waterLogs]);
  const latestProgress = progressEntries.at(-1) ?? null;
  const today = getCurrentWeekday();
  const todayPlanDay = activePlan?.days.find((day) => day.weekday === today && day.exercises.length > 0) ?? null;
  const todaySleepLog = sleepLogs.find((log) => log.log_date === todayIso()) ?? null;
  const supplementsTaken = supplements.length > 0 && supplements.every((item) => item.taken_today);
  const plannedMealsCount = mealPlanItems.length;
  const doneMealsCount = mealPlanItems.filter((item) => item.status === "done").length;
  const waterLiters = Math.round((waterTotalMl / 1000) * 10) / 10;
  const waterTargetLiters = Math.round((displayTargets.water_ml / 1000) * 10) / 10;

  async function quickMarkMealDone(item: MealPlanItem) {
    if (!user?.id) return;
    try {
      const result = await markMealPlanItemDone(item);
      setMealPlanItems((current) => current.map((meal) => (meal.id === result.item.id ? result.item : meal)));
      if (result.log) setLogs((current) => [result.log as FoodLog, ...current]);
      toast({ title: result.already_done ? "Meal already done" : "Meal marked done", description: result.already_done ? "No duplicate food log was created." : `${item.food_name} was added to Food Log.` });
    } catch (error) {
      toast({ title: "Could not mark meal done", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function quickAddWater(amountMl: number) {
    if (!user?.id) return;
    try {
      const log = await addWaterLog(user.id, todayIso(), amountMl);
      setWaterLogs((current) => [log, ...current]);
    } catch (error) {
      toast({ title: "Could not add water", description: error instanceof Error ? error.message : "Please try again." });
    }
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
              <Link href="/meals">
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Flame}
          label="Calories eaten"
          value={`${totals.calories} kcal`}
          detail={hasTargets ? `${remaining.calories} kcal remaining` : "No calorie target set"}
          progress={hasTargets ? percent(totals.calories, displayTargets.daily_calories) : undefined}
        />
        <MetricCard
          icon={Soup}
          label="Protein"
          value={`${totals.protein_g}g`}
          detail={hasTargets ? `${remaining.protein_g}g remaining` : "Set protein target"}
          progress={hasTargets ? percent(totals.protein_g, displayTargets.protein_g) : undefined}
        />
        <MetricCard
          icon={Droplets}
          label="Water intake"
          value={waterTotalMl ? `${waterLiters} L` : "No water logged"}
          detail={hasTargets ? `Target ${waterTargetLiters} L today` : "Set water target"}
          progress={hasTargets ? percent(waterTotalMl, displayTargets.water_ml) : undefined}
        />
        <MetricCard icon={Scale} label="Current weight" value={latestProgress?.body_weight_kg ? `${latestProgress.body_weight_kg} kg` : "No progress entry"} detail={latestProgress ? `Latest entry ${latestProgress.entry_date}` : "Add your first progress entry"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              Today's plan
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-sm font-semibold text-muted-foreground">Workout</p>
              {activePlan ? (
                <>
                  <p className="mt-1 font-semibold">{todayPlanDay ? todayPlanDay.day_name : `${today} rest day`}</p>
                  <p className="text-sm text-muted-foreground">{activePlan.name}</p>
                  <Button asChild className="mt-3" size="sm">
                    <Link href={todayPlanDay ? `/workouts/session/day/${todayPlanDay.id}` : `/my-workout/plans/${activePlan.id}`}>
                      <Dumbbell className="h-4 w-4" />
                      {openSessionId ? "Resume Workout" : todayPlanDay ? "Start Today's Workout" : "View Active Plan"}
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-1 font-semibold">No workout plan active</p>
                  <p className="text-sm text-muted-foreground">Import a ChatGPT plan or create a manual plan.</p>
                  <Button asChild className="mt-3" size="sm">
                    <Link href="/my-workout/plans">Import Workout Plan</Link>
                  </Button>
                </>
              )}
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-semibold text-muted-foreground">Meals</p>
              <p className="mt-1 font-semibold">{doneMealsCount}/{plannedMealsCount} planned meals done</p>
                  <p className="text-sm text-muted-foreground">{plannedMealsCount ? "Planned meals only count after they are marked done." : "No meals planned for today."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {mealPlanItems.filter((item) => item.status !== "done").slice(0, 2).map((item) => (
                  <Button key={item.id} type="button" size="sm" onClick={() => quickMarkMealDone(item)}>
                    <CheckCircle2 className="h-4 w-4" />
                    Mark {item.meal_type} done
                  </Button>
                ))}
                <Button asChild size="sm" variant="outline">
                  <Link href="/my-meal-plan">Manage Meal Plan</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="outline">
              <Link href="/settings">
                <Activity className="h-4 w-4" />
                Import from ChatGPT
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/meals">
                <Utensils className="h-4 w-4" />
                Log Food
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/calories">Calories/Macros</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/progress">
                <Scale className="h-4 w-4" />
                Add Progress
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/hydration">
                <Droplets className="h-4 w-4" />
                Add Water
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/workouts">
                <Dumbbell className="h-4 w-4" />
                Exercise Library
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Water quick add</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[250, 500, 750, 1000].map((amount) => (
            <Button key={amount} type="button" variant="outline" onClick={() => quickAddWater(amount)}>
              <Droplets className="h-4 w-4" />
              +{amount === 1000 ? "1 L" : `${amount} ml`}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Macros today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasTargets ? (
              <>
                <MacroLine label="Protein" value={totals.protein_g} target={displayTargets.protein_g} />
                <MacroLine label="Carbs" value={totals.carbs_g} target={displayTargets.carbs_g} />
                <MacroLine label="Fat" value={totals.fat_g} target={displayTargets.fat_g} />
              </>
            ) : (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                No calorie or macro targets set. Open Calories/Macros or Profile & Goals to save your targets.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Daily checklist</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <ChecklistLine label="Workout" done={Boolean(history.find((session) => session.status === "completed" && session.started_at?.slice(0, 10) === todayIso()))} emptyLabel={todayPlanDay ? "Not completed yet" : "Rest day or no active plan"} />
            <ChecklistLine label="Meals" done={plannedMealsCount > 0 && doneMealsCount === plannedMealsCount} emptyLabel={plannedMealsCount ? `${plannedMealsCount - doneMealsCount} planned meals left` : "No meals planned"} />
            <ChecklistLine label="Protein" done={hasTargets && totals.protein_g >= displayTargets.protein_g} emptyLabel={hasTargets ? `${remaining.protein_g}g remaining` : "Set protein target"} />
            <ChecklistLine label="Water" done={hasTargets && waterTotalMl >= displayTargets.water_ml} emptyLabel={hasTargets ? (waterTotalMl ? `${Math.max(0, displayTargets.water_ml - waterTotalMl)} ml remaining` : "No water logged today") : "Set water target"} />
            <ChecklistLine label="Supplements" done={supplementsTaken} emptyLabel={supplements.length ? "Supplements still open" : "No supplements scheduled"} />
            <ChecklistLine label="Sleep/recovery" done={Boolean(todaySleepLog)} emptyLabel="No sleep/recovery log today" />
            <ChecklistLine label="Progress" done={Boolean(latestProgress?.entry_date === todayIso())} emptyLabel="No progress entry today" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent meals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {logs.slice(0, 4).map((log) => (
              <div key={log.id} className="rounded-md border p-3">
                <p className="font-semibold">{log.food_name}</p>
                <p className="text-sm text-muted-foreground">{log.calories} kcal | {log.protein_g}g protein</p>
              </div>
            ))}
            {!logs.length ? <p className="text-sm text-muted-foreground">No meals logged yet.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent workouts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.slice(0, 4).map((session) => (
              <div key={session.id} className="rounded-md border p-3">
                <p className="font-semibold">{session.workout_name}</p>
                <p className="text-sm text-muted-foreground">{session.status} | {session.duration_minutes ?? 0} minutes</p>
              </div>
            ))}
            {!history.length ? <p className="text-sm text-muted-foreground">No workouts logged yet.</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <DashboardCharts macros={totals} />
      </div>
      {isLoading ? <p className="mt-3 text-sm text-muted-foreground">Refreshing today's real data...</p> : null}
    </>
  );
}

function MacroLine({ label, value, target }: { label: string; value: number; target: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}g / {target}g</span>
      </div>
      <Progress value={percent(value, target)} />
    </div>
  );
}

function ChecklistLine({ label, done, emptyLabel }: { label: string; done: boolean; emptyLabel: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="font-medium">{label}</span>
      <span className={done ? "text-sm font-semibold text-primary" : "text-sm text-muted-foreground"}>{done ? "Done" : emptyLabel}</span>
    </div>
  );
}
