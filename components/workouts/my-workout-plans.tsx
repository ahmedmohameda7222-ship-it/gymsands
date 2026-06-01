"use client";

import Link from "next/link";
import { CalendarDays, Dumbbell, Plus, RefreshCcw, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { deleteUserWorkoutPlan, getUserWorkoutPlans, setDefaultUserWorkoutPlan } from "@/services/database/repository";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";
import type { UserWorkoutPlan } from "@/types";

export function MyWorkoutPlans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<UserWorkoutPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  async function loadPlans() {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setPlans(await getUserWorkoutPlans(user.id));
    } catch (error) {
      toast({ title: "Could not load My Plans", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function setDefaultPlan(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    const previousPlans = plans;
    setPlans((current) =>
      current.map((item) => ({
        ...item,
        is_active: item.id === plan.id,
        is_default: item.id === plan.id
      }))
    );
    try {
      await setDefaultUserWorkoutPlan(user.id, plan.id);
      toast({ title: "Default plan updated", description: `${plan.name} is now used for Today's Workout and Weekly Overview.` });
    } catch (error) {
      setPlans(previousPlans);
      toast({ title: "Could not set default plan", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function deletePlan(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    const confirmed = window.confirm(`Delete "${plan.name}"? This removes the plan only from your account.`);
    if (!confirmed) return;

    const previousPlans = plans;
    setBusyPlanId(plan.id);
    setPlans((current) => current.filter((item) => item.id !== plan.id));
    try {
      await deleteUserWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: "Plan deleted", description: `${plan.name} was removed from My Plans.` });
    } catch (error) {
      setPlans(previousPlans);
      toast({ title: "Could not delete plan", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusyPlanId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">My Plans</h2>
          <p className="text-sm text-muted-foreground">Workout plans saved to your account.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadPlans} disabled={isLoading}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowBuilder((current) => !current)}>
            <Plus className="h-4 w-4" />
            {showBuilder ? "Close Builder" : "Add New Workout Plan"}
          </Button>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading saved plans...</p> : null}
      {!isLoading && !plans.length ? <p className="rounded-md border bg-white p-4 text-sm text-muted-foreground">No custom plans yet.</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const exerciseCount = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
          const isDefault = plan.is_default ?? plan.is_active;
          return (
            <Card key={plan.id}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-3">
                  <span>{plan.name}</span>
                  {isDefault ? <Badge>Default</Badge> : <Badge variant="outline">Saved</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <PlanMetric icon={CalendarDays} label="Days" value={plan.days.length} />
                  <PlanMetric icon={Dumbbell} label="Exercises" value={exerciseCount} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {plan.days.slice(0, 4).map((day) => (
                    <Badge key={day.id} variant="outline">{day.weekday ?? day.day_name}</Badge>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Button asChild className="w-full">
                    <Link href={`/my-workout/plans/${plan.id}`}>Open Plan</Link>
                  </Button>
                  <Button type="button" variant={isDefault ? "secondary" : "outline"} className="w-full" onClick={() => setDefaultPlan(plan)} disabled={isDefault || busyPlanId === plan.id}>
                    <Star className="h-4 w-4" />
                    {isDefault ? "Default Plan" : "Set as Default Plan"}
                  </Button>
                  <Button type="button" variant="destructive" className="w-full" onClick={() => deletePlan(plan)} disabled={busyPlanId === plan.id}>
                    <Trash2 className="h-4 w-4" />
                    Delete Plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {showBuilder ? <WorkoutPlanBuilder loadActivePlan={false} onSaved={loadPlans} /> : null}
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
    <div className="rounded-md bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
