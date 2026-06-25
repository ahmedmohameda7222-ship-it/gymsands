"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCcw } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toaster";

type Plan = {
  id: string;
  name: string;
  goal: string | null;
  source: string | null;
  is_active: boolean | null;
  program_duration_weeks: number | null;
  days_per_week: number | null;
  session_duration_minutes: number | null;
};

type PlanDay = {
  id: string;
  plan_id: string;
  day_number: number;
  day_name: string;
  focus: string | null;
};

type PlanExercise = {
  id: string;
  plan_day_id: string;
  exercise_name: string;
  category: string | null;
  block_type: string | null;
  sets: number | null;
  reps: string | null;
  equipment: string | null;
};

export function ChatGptWorkoutPlans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [exercises, setExercises] = useState<PlanExercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadPlans = useCallback(async () => {
    if (!supabase || !user) return;
    setIsLoading(true);
    try {
      const planResult = await supabase
        .from("user_workout_plans")
        .select("id,name,goal,source,is_active,program_duration_weeks,days_per_week,session_duration_minutes")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (planResult.error) throw planResult.error;
      const nextPlans = (planResult.data ?? []) as Plan[];
      setPlans(nextPlans);

      const planIds = nextPlans.map((plan) => plan.id);
      if (!planIds.length) {
        setDays([]);
        setExercises([]);
        return;
      }

      const dayResult = await supabase
        .from("user_workout_plan_days")
        .select("id,plan_id,day_number,day_name,focus")
        .in("plan_id", planIds)
        .order("day_number", { ascending: true });
      if (dayResult.error) throw dayResult.error;
      const nextDays = (dayResult.data ?? []) as PlanDay[];
      setDays(nextDays);

      const dayIds = nextDays.map((day) => day.id);
      if (!dayIds.length) {
        setExercises([]);
        return;
      }

      const exerciseResult = await supabase
        .from("user_workout_plan_exercises")
        .select("id,plan_day_id,exercise_name,category,block_type,sets,reps,equipment")
        .in("plan_day_id", dayIds)
        .order("sort_order", { ascending: true });
      if (exerciseResult.error) throw exerciseResult.error;
      setExercises((exerciseResult.data ?? []) as PlanExercise[]);
    } catch (error) {
      toast({ title: "Could not load workout plans", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setIsLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> ChatGPT-created plans
          </CardTitle>
          <CardDescription>
            Plaivra does not create workout plans internally. Create plans in ChatGPT; Plaivra stores, schedules, displays, and tracks them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={loadPlans} disabled={isLoading} variant="outline">
            <RefreshCcw className="h-4 w-4" /> {isLoading ? "Refreshing..." : "Refresh plans"}
          </Button>
        </CardContent>
      </Card>

      {!plans.length && !isLoading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No saved workout plans yet. In ChatGPT, ask: "Using Plaivra, create and save a 4-day Push Pull Legs Upper workout plan."
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => {
          const planDays = days.filter((day) => day.plan_id === plan.id);
          return (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>{plan.goal || "ChatGPT workout plan"}</CardDescription>
                  </div>
                  {plan.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Saved</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {plan.program_duration_weeks ? <Badge variant="outline">{plan.program_duration_weeks} weeks</Badge> : null}
                  {plan.days_per_week ? <Badge variant="outline">{plan.days_per_week} days/week</Badge> : null}
                  {plan.session_duration_minutes ? <Badge variant="outline">{plan.session_duration_minutes} min</Badge> : null}
                </div>
                {planDays.map((day) => {
                  const dayExercises = exercises.filter((exercise) => exercise.plan_day_id === day.id);
                  return (
                    <div key={day.id} className="rounded-md border bg-card p-3">
                      <p className="font-semibold">
                        Day {day.day_number}: {day.day_name}
                      </p>
                      {day.focus ? <p className="text-sm text-muted-foreground">{day.focus}</p> : null}
                      <div className="mt-3 space-y-2">
                        {dayExercises.map((exercise) => (
                          <div key={exercise.id} className="rounded-md bg-background p-2 text-sm">
                            <span className="font-medium">{exercise.exercise_name}</span>
                            <span className="text-muted-foreground"> - {[exercise.block_type || exercise.category, exercise.sets ? `${exercise.sets} sets` : null, exercise.reps, exercise.equipment].filter(Boolean).join(" / ")}</span>
                          </div>
                        ))}
                        {!dayExercises.length ? <p className="text-sm text-muted-foreground">No exercises saved for this day.</p> : null}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
