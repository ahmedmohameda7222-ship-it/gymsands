"use client";

import { ChevronLeft, ChevronRight, Dumbbell, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getDefaultUserWorkoutPlan, getNutritionWeek, getWorkoutActivity } from "@/services/database/repository";
import { percent } from "@/services/nutrition/calculations";
import { todayIso } from "@/lib/utils";
import type { DailyNutritionSummary, UserWorkoutPlan, Weekday, WorkoutSession } from "@/types";

const weekdays: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return toDateOnly(date);
}

function formatDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function weekdayForDate(value: string) {
  return weekdays[new Date(`${value}T00:00:00`).getDay()];
}

function sessionDate(session: WorkoutSession) {
  return (session.completed_at || session.skipped_at || session.started_at).slice(0, 10);
}

function hasExpectedWorkout(plan: UserWorkoutPlan | null, date: string) {
  if (!plan) return false;
  const weekday = weekdayForDate(date);
  return plan.days.some((day) => day.weekday === weekday && day.exercises.length > 0);
}

function statusForDay(plan: UserWorkoutPlan | null, date: string, sessions: WorkoutSession[]) {
  const expected = hasExpectedWorkout(plan, date);
  const daySessions = sessions.filter((session) => sessionDate(session) === date);
  const trained = daySessions.some((session) => session.status !== "skipped");
  const explicitSkipped = daySessions.some((session) => session.status === "skipped");

  if (trained) return { label: "Trained", tone: "success" as const, trained: true, skipped: false };
  if (expected && (explicitSkipped || !trained)) return { label: "Skipped", tone: "outline" as const, trained: false, skipped: true };
  if (expected) return { label: "Expected", tone: "outline" as const, trained: false, skipped: false };
  return { label: "Rest day", tone: "outline" as const, trained: false, skipped: false };
}

export function WeeklyOverviewPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [weekData, setWeekData] = useState<DailyNutritionSummary[]>([]);
  const [activity, setActivity] = useState<WorkoutSession[]>([]);
  const [defaultPlan, setDefaultPlan] = useState<UserWorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    Promise.all([
      getNutritionWeek(user.id, weekStart),
      getWorkoutActivity(user.id, 180),
      getDefaultUserWorkoutPlan(user.id)
    ])
      .then(([nutrition, workoutActivity, plan]) => {
        if (!active) return;
        setWeekData(nutrition);
        setActivity(workoutActivity);
        setDefaultPlan(plan);
      })
      .catch((error) => {
        toast({ title: "Could not load weekly overview", description: error instanceof Error ? error.message : "Please try again." });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [toast, user?.id, weekStart]);

  const statuses = weekData.map((day) => ({ date: day.date, ...statusForDay(defaultPlan, day.date, activity) }));
  const weeklyTotal = weekData.reduce((sum, day) => sum + day.calories, 0);
  const weeklyTarget = weekData.reduce((sum, day) => sum + day.planned_calories, 0);
  const trainedDays = statuses.filter((status) => status.trained).length;
  const skippedDays = statuses.filter((status) => status.skipped).length;
  const loggedDays = weekData.filter((day) => day.logs.length > 0).length;
  const maxCalories = Math.max(1, ...weekData.map((day) => Math.max(day.planned_calories, day.calories)));

  function moveWeek(days: number) {
    setSelectedDate(toDateOnly(addDays(new Date(`${selectedDate}T00:00:00`), days)));
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading weekly overview...</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge>{formatDay(weekData[0]?.date ?? weekStart)} - {formatDay(weekData[6]?.date ?? weekStart)}</Badge>
          {defaultPlan ? <Badge variant="outline">{defaultPlan.name}</Badge> : <Badge variant="outline">No default plan</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => moveWeek(-7)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
          <Button variant="outline" size="sm" onClick={() => moveWeek(7)}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric label="Weekly total" value={`${weeklyTotal} kcal`} detail={`${weeklyTarget} kcal planned`} />
        <OverviewMetric label="Daily average" value={`${Math.round(weeklyTotal / 7)} kcal`} detail={`${loggedDays}/7 days logged`} />
        <OverviewMetric label="Trained days" value={trainedDays} detail="Workout completed or logged" />
        <OverviewMetric label="Skipped days" value={skippedDays} detail={defaultPlan ? "Expected from default plan" : "No default plan selected"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="h-5 w-5 text-primary" />
            Weekly calorie summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">Weekly progress</span>
              <span className="text-muted-foreground">{weeklyTotal} / {weeklyTarget} kcal</span>
            </div>
            <Progress value={percent(weeklyTotal, weeklyTarget)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {weekData.map((day) => {
              const status = statuses.find((item) => item.date === day.date);
              return (
                <div key={day.date} className="rounded-md border bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{formatDay(day.date)}</p>
                    <Badge variant={status?.tone ?? "outline"}>{status?.label ?? "Unknown"}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{day.calories} / {day.planned_calories} kcal</p>
                  <p className="mt-1 text-xs text-muted-foreground">P {day.protein_g}g | C {day.carbs_g}g | F {day.fat_g}g</p>
                  <Progress value={percent(day.calories, day.planned_calories)} className="mt-3" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            Training expectation
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-md border p-3">
            <p className="text-sm font-semibold">Calories consumed per day</p>
            <div className="mt-3 space-y-2">
              {weekData.map((day) => (
                <div key={day.date} className="grid grid-cols-[78px_1fr_72px] items-center gap-3 text-xs">
                  <span>{formatDay(day.date).split(",")[0]}</span>
                  <div className="h-2 rounded bg-emerald-100">
                    <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, (day.calories / maxCalories) * 100)}%` }} />
                  </div>
                  <span className="text-right">{day.calories}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm font-semibold">Default plan logic</p>
            {defaultPlan ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A skipped day is counted when {defaultPlan.name} has a workout assigned for that weekday and no completed workout was logged.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                No default workout plan is selected, so trained and skipped counts stay safe at zero until you choose one from My Plans.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewMetric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
        {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}
