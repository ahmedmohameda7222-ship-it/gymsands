"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Play, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import Link from "next/link";
import { createUserWorkoutPlanDay, getCurrentWeekday, getUserWorkoutPlan, weekDays, workoutsFromPlanDay } from "@/services/database/workout-plans";
import { getWorkoutActivity } from "@/services/database/workout-sessions";
import { analyzeImportedWorkoutPlan } from "@/services/workouts/imported-plan-quality";
import { WorkoutCalendar, type WeeklyPlanDay } from "@/components/workouts/workout-calendar";
import type { UserWorkoutPlan, WorkoutSession } from "@/types";

function daysFromPlan(plan: UserWorkoutPlan): WeeklyPlanDay[] {
  return plan.days.map((day) => ({
    id: day.id,
    planId: day.plan_id,
    dayName: day.day_name,
    weekday: day.weekday,
    notes: day.notes ?? "",
    exercises: workoutsFromPlanDay(day)
  }));
}

export function WorkoutPlanDetail() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [plan, setPlan] = useState<UserWorkoutPlan | null>(null);
  const [activity, setActivity] = useState<WorkoutSession[]>([]);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingDay, setIsAddingDay] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadPlan() {
      if (!user?.id) return;
      setIsLoading(true);
      try {
        const [nextPlan, nextActivity] = await Promise.all([
          getUserWorkoutPlan(user.id, params.planId),
          getWorkoutActivity(user.id)
        ]);
        if (!active) return;
        setPlan(nextPlan);
        setActivity(nextActivity);
      } catch (error) {
        toast({ title: "Could not load plan", description: error instanceof Error ? error.message : "Please try again." });
      } finally {
        if (active) setIsLoading(false);
      }
    }
    loadPlan();
    return () => {
      active = false;
    };
  }, [params.planId, toast, user?.id]);

  const days = useMemo(() => (plan ? daysFromPlan(plan) : []), [plan]);
  const activeDay = days[activeDayIndex] ?? days[0];
  const quality = useMemo(() => (plan ? analyzeImportedWorkoutPlan(plan) : null), [plan]);

  function startDay(day: WeeklyPlanDay | undefined) {
    if (!day?.id) return;
    router.push(`/workouts/session/day/${day.id}`);
  }

  function editDay(day: WeeklyPlanDay | undefined) {
    if (!day?.id) return;
    router.push(`/my-workout/day/${day.id}`);
  }

  function startToday() {
    const today = getCurrentWeekday();
    const todayIndex = days.findIndex((day) => day.weekday === today && day.exercises.length > 0);
    if (todayIndex < 0) {
      toast({ title: "No workout for today", description: `Today is ${today}. Choose another day from the calendar.` });
      return;
    }
    startDay(days[todayIndex]);
  }

  async function addDay() {
    if (!plan || isAddingDay) return;
    const usedWeekdays = new Set(plan.days.map((day) => day.weekday).filter(Boolean));
    const nextWeekday = weekDays.find((weekday) => !usedWeekdays.has(weekday)) ?? null;
    try {
      setIsAddingDay(true);
      const day = await createUserWorkoutPlanDay(plan.id, {
        dayName: `Workout day ${plan.days.length + 1}`,
        weekday: nextWeekday,
        notes: "",
        exercises: []
      });
      toast({ title: "Workout day added", description: "Add exercises to finish the new day." });
      router.push(`/my-workout/day/${day.id}/add-exercise`);
    } catch (error) {
      toast({ title: "Could not add day", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsAddingDay(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading plan...</p>;
  if (!plan) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm text-muted-foreground">This workout plan could not be found.</p>
          <Button asChild variant="outline">
            <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to Workout Plans</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to Workout Plans</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {(plan.is_default ?? plan.is_active) ? <Badge>Default Plan</Badge> : null}
          <Badge>{plan.days.length} days</Badge>
          <Badge variant="outline">{plan.days.reduce((sum, day) => sum + day.exercises.length, 0)} exercises</Badge>
          <Button size="sm" onClick={addDay} disabled={isAddingDay || plan.days.length >= 7}>
            <Plus className="h-4 w-4" />
            {isAddingDay ? "Adding..." : "Add Day"}
          </Button>
        </div>
      </div>

      <WorkoutCalendar
        days={days}
        activity={activity}
        activeDayIndex={activeDayIndex}
        onSelectDay={setActiveDayIndex}
        onStartToday={startToday}
      />

      {quality ? (
        <Card>
          <CardHeader>
            <CardTitle>Plan quality check</CardTitle>
            <p className="text-sm text-muted-foreground">Imported-plan checks use saved days, exercises, equipment, and structure. They do not generate new plan content.</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Readiness</p>
              <p className="mt-1 text-2xl font-bold">{quality.score}/100</p>
              <p className="mt-1 text-sm text-muted-foreground">{quality.status === "ready" ? "Ready to start" : quality.status === "blocked" ? "Fix blockers before starting" : "Review before starting"}</p>
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Warnings</p>
              <p className="mt-1 font-semibold">{quality.warnings.length + quality.blockers.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">{[...quality.blockers, ...quality.warnings].slice(0, 2).join(" ") || "No structural warnings detected."}</p>
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Repair tips</p>
              <p className="mt-1 font-semibold">{quality.repairTips.length ? "Available" : "None needed"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{quality.repairTips[0] ?? "The plan has enough detail for tracking."}</p>
            </div>
            <div className="rounded-md border p-3 md:col-span-3">
              <p className="text-sm font-semibold">Warnings and repair checklist</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <QualityList
                  title="Needs review"
                  items={[...quality.blockers, ...quality.warnings]}
                  empty="No structural warnings detected."
                />
                <QualityList
                  title="Safe repair suggestions"
                  items={quality.repairTips}
                  empty="No repair suggestions needed."
                />
              </div>
              {quality.duplicateExercises.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Duplicate exercises to review: {quality.duplicateExercises.join(", ")}.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{plan.name}</CardTitle>
          <p className="text-sm text-muted-foreground">Select a day in the weekly calendar, then edit it or start training.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeDay ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white p-3">
                <div>
                  <p className="font-semibold text-slate-950">{activeDay.dayName}</p>
                  <p className="text-sm text-muted-foreground">{activeDay.weekday ?? "No weekday"} | {activeDay.exercises.length} exercises</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => editDay(activeDay)}>
                    <Pencil className="h-4 w-4" />
                    Edit Day
                  </Button>
                  <Button onClick={() => startDay(activeDay)} disabled={!activeDay.exercises.length}>
                    <Play className="h-4 w-4" />
                    Start Day
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {activeDay.exercises.map((exercise, index) => (
                  <div key={`${exercise.id}-${index}`} className="rounded-md border bg-white p-3">
                    <p className="font-semibold">{index + 1}. {exercise.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{exercise.target_muscle} | {exercise.equipment}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">{exercise.sets ?? 3} sets</Badge>
                      <Badge variant="outline">{exercise.reps ?? "8-12"}</Badge>
                      <Badge variant="outline">{exercise.rest_seconds ?? 75}s rest</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Choose a workout day from the calendar.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QualityList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">
        {items.length ? items.map((item) => <p key={item}>{item}</p>) : <p>{empty}</p>}
      </div>
    </div>
  );
}
