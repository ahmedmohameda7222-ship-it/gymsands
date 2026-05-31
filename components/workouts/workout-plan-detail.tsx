"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getCurrentWeekday, getUserWorkoutPlan, getWorkoutActivity, workoutsFromPlanDay } from "@/services/database/repository";
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading plan...</p>;
  if (!plan) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm text-muted-foreground">This workout plan could not be found.</p>
          <Button asChild variant="outline">
            <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to My Plans</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to My Plans</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Badge>{plan.days.length} days</Badge>
          <Badge variant="outline">{plan.days.reduce((sum, day) => sum + day.exercises.length, 0)} exercises</Badge>
        </div>
      </div>

      <WorkoutCalendar
        days={days}
        activity={activity}
        activeDayIndex={activeDayIndex}
        onSelectDay={setActiveDayIndex}
        onStartToday={startToday}
      />

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
