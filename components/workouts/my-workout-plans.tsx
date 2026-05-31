"use client";

import Link from "next/link";
import { CalendarDays, Dumbbell, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getUserWorkoutPlans } from "@/services/database/repository";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";
import type { UserWorkoutPlan } from "@/types";

export function MyWorkoutPlans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<UserWorkoutPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);

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
          return (
            <Card key={plan.id}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-3">
                  <span>{plan.name}</span>
                  {plan.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Saved</Badge>}
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
                <Button asChild className="w-full">
                  <Link href={`/my-workout/plans/${plan.id}`}>Open Plan</Link>
                </Button>
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
