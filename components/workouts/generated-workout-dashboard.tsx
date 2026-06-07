"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Dumbbell, Eye, Loader2, MessageCircle, RefreshCcw, Sparkles, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase/client";
import { getGeneratedWorkoutPlans, setDefaultUserWorkoutPlan } from "@/services/database/repository";
import type { GeneratedWorkoutPlan, UserWorkoutPlanDay } from "@/types";

function planDays(plan: GeneratedWorkoutPlan) {
  if (plan.days.length) {
    return plan.days.map((day) => ({
      id: day.id,
      dayNumber: day.day_number,
      title: day.day_name,
      muscleGroups: Array.from(
        new Set(day.exercises.map((exercise) => exercise.target_muscle || exercise.category).filter((value): value is string => Boolean(value)))
      ).slice(0, 3),
      exercises: day.exercises
    }));
  }

  return (plan.template?.days ?? []).map((day) => ({
    id: day.id,
    dayNumber: day.day_index,
    title: day.day_title,
    muscleGroups: [day.day_title],
    exercises: day.exercises.map((exercise) => ({
      id: exercise.id,
      plan_day_id: day.id,
      workout_id: null,
      source_workout_id: exercise.id,
      exercise_name: exercise.exercise_name,
      category: plan.template?.main_goal ?? null,
      target_muscle: day.day_title,
      equipment: plan.template?.equipment_required.join(", ") ?? null,
      sets: Number(exercise.sets?.match(/\d+/)?.[0] ?? 3),
      reps: exercise.reps,
      rest_seconds: null,
      sort_order: exercise.exercise_order,
      notes: exercise.sets && !/^\d+$/.test(exercise.sets) ? `Sets: ${exercise.sets}` : null
    }))
  }));
}

function planExerciseCount(plan: GeneratedWorkoutPlan) {
  return planDays(plan).reduce((sum, day) => sum + day.exercises.length, 0);
}

function displayDuration(plan: GeneratedWorkoutPlan) {
  return plan.template?.time_per_workout || "Flexible";
}

function goalTags(plan: GeneratedWorkoutPlan) {
  const values = [
    plan.template?.main_goal,
    plan.template?.workout_type,
    plan.template?.training_level,
    plan.program_duration_weeks ? `${plan.program_duration_weeks} weeks` : null,
    plan.days_per_week ? `${plan.days_per_week} days/week` : null
  ].filter(Boolean) as string[];
  return values;
}

async function keepOnlyGeneratedPlan(userId: string, planId: string) {
  await setDefaultUserWorkoutPlan(userId, planId);
  if (!supabase) return;

  const { error } = await supabase
    .from("user_workout_plans")
    .delete()
    .eq("user_id", userId)
    .eq("source", "generated_rules")
    .neq("id", planId);

  if (error) throw error;
}

export function GeneratedWorkoutDashboard() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<GeneratedWorkoutPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState("");
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  async function loadPlans() {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const nextPlans = await getGeneratedWorkoutPlans(user.id);
      setPlans(nextPlans);
      setSelectedPlanId((current) => current ?? nextPlans[0]?.id ?? null);
    } catch (error) {
      setPlans([]);
      toast({ title: "Could not load generated plans", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null,
    [plans, selectedPlanId]
  );

  function previewPlan(planId: string) {
    setSelectedPlanId(planId);
    window.requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function setActivePlan(plan: GeneratedWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    const previousPlans = plans;
    const activatedPlan = { ...plan, is_active: true, is_default: true };
    setPlans([activatedPlan]);
    setSelectedPlanId(plan.id);
    try {
      await keepOnlyGeneratedPlan(user.id, plan.id);
      toast({ title: "Active plan updated", description: `${plan.name} is the only generated plan saved now.` });
    } catch (error) {
      setPlans(previousPlans);
      toast({ title: "Could not activate plan", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function explainPlan() {
    if (!selectedPlan) return;
    setIsCoachLoading(true);
    const response = await fetch("/api/ai/coach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`
      },
      body: JSON.stringify({ mode: "plan_explanation", context: selectedPlan })
    });
    const data = await response.json().catch(() => ({}));
    setIsCoachLoading(false);
    if (!response.ok) return toast({ title: "Coach unavailable", description: data.error ?? "Try again later." });
    setCoachMessage(data.message ?? "");
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading generated plans...
        </CardContent>
      </Card>
    );
  }

  if (!plans.length) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="rounded-md border bg-card p-4">
            <p className="font-semibold text-foreground">No generated plans yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Complete onboarding to compare matched plans from the workout library.</p>
          </div>
          <Button asChild>
            <Link href="/onboarding">
              <Sparkles className="h-4 w-4" />
              Create generated plans
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Matched generated plans</h2>
          <p className="text-sm text-muted-foreground">Preview the full plan before choosing the one that becomes your active default.</p>
        </div>
        <Button variant="outline" onClick={loadPlans} disabled={isLoading}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </Button>
        <Button asChild variant="outline">
          <Link href="/onboarding">
            <Sparkles className="h-4 w-4" />
            Regenerate
          </Link>
        </Button>
        <Button variant="outline" onClick={explainPlan} disabled={!selectedPlan || isCoachLoading}>
          <MessageCircle className="h-4 w-4" />
          {isCoachLoading ? "Asking coach..." : "Coach explanation"}
        </Button>
      </div>

      {coachMessage ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm leading-6 text-muted-foreground">{coachMessage}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          {plans.map((plan) => {
            const isSelected = selectedPlan?.id === plan.id;
            const isDefault = plan.is_default ?? plan.is_active;
            return (
              <Card key={plan.id} className={isSelected ? "border-primary" : undefined}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-3">
                    <span>{plan.template?.title ?? plan.name}</span>
                    {isDefault ? <Badge>Active</Badge> : <Badge variant="outline">{plan.match_score ?? 0}% match</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">{plan.match_explanation || "Matched from your onboarding profile."}</p>
                  <div className="flex flex-wrap gap-2">
                    {goalTags(plan).map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                    <Badge variant="outline">{displayDuration(plan)}</Badge>
                    <Badge variant="outline">{planExerciseCount(plan)} exercises</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PlanMetric icon={CalendarDays} label="Training cycle" value={plan.template?.workout_type ?? "Flexible"} />
                    <PlanMetric icon={Clock} label="Duration" value={displayDuration(plan)} />
                    <PlanMetric icon={Dumbbell} label="Equipment" value={(plan.template?.equipment_required ?? []).slice(0, 2).join(", ") || "Varies"} />
                    <PlanMetric icon={Sparkles} label="Level" value={plan.template?.training_level ?? "All levels"} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant={isSelected ? "secondary" : "outline"} onClick={() => previewPlan(plan.id)}>
                      <Eye className="h-4 w-4" />
                      Preview
                    </Button>
                    <Button type="button" onClick={() => setActivePlan(plan)} disabled={isDefault || busyPlanId === plan.id}>
                      {isDefault ? <CheckCircle2 className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                      {isDefault ? "Active Plan" : "Use as Default Plan"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div ref={previewRef}>
          <PlanOverview plan={selectedPlan} onActivate={setActivePlan} busyPlanId={busyPlanId} />
        </div>
      </div>
    </div>
  );
}

function PlanOverview({
  plan,
  onActivate,
  busyPlanId
}: {
  plan: GeneratedWorkoutPlan | null;
  onActivate: (plan: GeneratedWorkoutPlan) => void;
  busyPlanId: string | null;
}) {
  if (!plan) return null;
  const days = planDays(plan);
  const isDefault = plan.is_default ?? plan.is_active;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {plan.template?.title ?? plan.name}
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.match_explanation || "Open the days below before making it your active plan."}</p>
          </div>
          <Button type="button" onClick={() => onActivate(plan)} disabled={isDefault || busyPlanId === plan.id}>
            <Star className="h-4 w-4" />
            {isDefault ? "Active Plan" : "Set as Active Plan"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{plan.match_score ?? 0}% match</Badge>
          <Badge variant="outline">{plan.template?.main_goal ?? "Goal"}</Badge>
          <Badge variant="outline">{plan.template?.workout_type ?? "Training cycle"}</Badge>
          <Badge variant="outline">{plan.template?.days_per_week ?? plan.days.length} days/week</Badge>
          <Badge variant="outline">{displayDuration(plan)}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {days.map((day) => (
            <DayCard key={day.id} day={day} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DayCard({
  day
}: {
  day: {
    id: string;
    dayNumber: number;
    title: string;
    muscleGroups: string[];
    exercises: UserWorkoutPlanDay["exercises"];
  };
}) {
  const isRest = day.exercises.length === 0;
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Day {day.dayNumber}</p>
          <h3 className="mt-1 font-semibold text-foreground">{day.title || (isRest ? "Rest" : "Workout")}</h3>
        </div>
        <Badge variant={isRest ? "outline" : "default"}>{isRest ? "Rest" : `${day.exercises.length} moves`}</Badge>
      </div>
      {day.muscleGroups.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {day.muscleGroups.map((group) => (
            <Badge key={group} variant="outline">{group}</Badge>
          ))}
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {day.exercises.map((exercise) => (
          <div key={`${exercise.id}-${exercise.sort_order}`} className="rounded-md border bg-background/60 p-2">
            <p className="text-sm font-semibold text-foreground">{exercise.sort_order}. {exercise.exercise_name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {exercise.sets ?? 3} sets / {exercise.reps ?? "8-12"} reps
            </p>
          </div>
        ))}
        {isRest ? <p className="text-sm text-muted-foreground">Recovery, mobility, or light walking.</p> : null}
      </div>
    </div>
  );
}

function PlanMetric({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border bg-background/60 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
