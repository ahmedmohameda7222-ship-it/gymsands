"use client";

import { CalendarCheck, CheckCircle2, ExternalLink, Play, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { useTranslation } from "@/lib/i18n/use-translation";
import Link from "next/link";
import { getTodayMealPlanItems, markMealPlanItemDone } from "@/services/database/nutrition";
import { getCurrentWeekday, getDefaultUserWorkoutPlan, workoutsFromPlanDay } from "@/services/database/workout-plans";
import type { MealPlanItem, UserWorkoutPlan, Workout } from "@/types";

function isLink(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function guideUrl(exercise: Workout) {
  return exercise.exercise_url || (isLink(exercise.notes) ? exercise.notes : null);
}

function customVideoUrl(exercise: Workout) {
  return exercise.custom_video_url || null;
}

export function TodaysWorkout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, dir } = useTranslation();
  const [plan, setPlan] = useState<UserWorkoutPlan | null>(null);
  const [mealItems, setMealItems] = useState<MealPlanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingMealId, setSavingMealId] = useState<string | null>(null);
  const today = useMemo(() => getCurrentWeekday(), []);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    Promise.all([getDefaultUserWorkoutPlan(user.id), getTodayMealPlanItems(user.id)])
      .then(([nextPlan, meals]) => {
        if (!active) return;
        setPlan(nextPlan);
        setMealItems(meals);
      })
      .catch((error) => {
        toast({ title: "Could not load today's workout", description: userSafeError(error, "Please refresh and try again.") });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [toast, user?.id]);

  async function markMealDone(item: MealPlanItem) {
    if (item.status !== "planned" || savingMealId) return;
    setSavingMealId(item.id);
    try {
      const { item: updated } = await markMealPlanItemDone(item);
      setMealItems((current) => current.map((meal) => (meal.id === updated.id ? updated : meal)));
      toast({ title: "Meal marked done", description: `${updated.food_name} was added to today's calories.` });
    } catch (error) {
      toast({ title: "Could not mark meal done", description: userSafeError(error) });
    } finally {
      setSavingMealId(null);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading today's workout...</p>;

  if (!plan) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm text-muted-foreground">No default workout plan selected. Please choose a default plan from Workout Plans.</p>
          <Button asChild>
            <Link href="/my-workout/plans">Open Workout Plans</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const todayDay = plan.days.find((day) => day.weekday === today && day.exercises.length > 0);

  if (!todayDay) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <CalendarCheck className="h-5 w-5 text-primary" />
            {today} is a rest day
          </div>
          <p className="text-sm text-muted-foreground">{plan.name} has no workout assigned for today.</p>
          <Button asChild variant="outline">
            <Link href={`/my-workout/plans/${plan.id}`}>View Default Plan</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const exercises = workoutsFromPlanDay(todayDay);

  return (
    <div className="space-y-5" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge>Default Plan</Badge>
          <Badge variant="outline">{plan.name}</Badge>
          <Badge variant="outline">{today}</Badge>
        </div>
        <Button asChild>
          <Link href={`/workouts/session/day/${todayDay.id}`}>
            <Play className="h-4 w-4" />
            Start Workout
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{todayDay.day_name}</CardTitle>
          <p className="text-sm text-muted-foreground">Read-only view of the workout assigned for today.</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {exercises.map((exercise, index) => {
            const url = guideUrl(exercise);
            const customUrl = customVideoUrl(exercise);
            return (
              <div key={`${exercise.id}-${index}`} className="rounded-md border bg-card p-3">
                <p className="font-semibold text-foreground">{index + 1}. {exercise.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {exercise.muscle_category || exercise.target_muscle} | {exercise.equipment_required || exercise.equipment}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{exercise.sets ?? 3} sets</Badge>
                  <Badge variant="outline">{exercise.reps ?? "8-12"}</Badge>
                  <Badge variant="outline">{exercise.rest_seconds ?? 75}s rest</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {url ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Open Exercise Guide
                      </a>
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled>
                      No guide added
                    </Button>
                  )}
                  {customUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={customUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Open Custom Video
                      </a>
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled>
                      No custom video
                    </Button>
                  )}
                </div>
                {!url && exercise.instructions ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{exercise.instructions}</p> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {mealItems.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Utensils className="h-5 w-5 text-primary" />
              Today's meals
            </CardTitle>
            <p className="text-sm text-muted-foreground">Read-only meal plan items for today.</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mealItems.map((item) => (
              <div key={item.id} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{item.food_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.meal_type} | {item.calories} kcal</p>
                  </div>
                  <Badge variant={item.status === "done" ? "success" : item.status === "skipped" ? "warning" : "outline"}>{item.status === "done" ? t("mealPlan.statusDone") : item.status === "skipped" ? t("mealPlan.statusSkipped") : t("mealPlan.statusPlanned")}</Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => markMealDone(item)}
                  disabled={item.status !== "planned" || savingMealId === item.id}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {item.status === "done" ? t("mealPlan.statusDone") : item.status === "skipped" ? t("mealPlan.statusSkipped") : "Mark Food Done"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
