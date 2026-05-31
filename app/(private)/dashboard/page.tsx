"use client";

import Link from "next/link";
import { Activity, Droplets, Dumbbell, Flame, Plus, Scale, Soup, Utensils } from "lucide-react";
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
import { getTodayFoodLogs, getWorkoutHistory } from "@/services/database/repository";
import { defaultTargets, percent, remainingMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import type { FoodLog, WorkoutSession } from "@/types";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [history, setHistory] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    if (!user) return;
    getTodayFoodLogs(user.id)
      .then(setLogs)
      .catch((error) =>
        toast({
          title: "Could not load meals",
          description: error instanceof Error ? error.message : "The dashboard will keep working with empty meal data."
        })
      );
    getWorkoutHistory(user.id)
      .then(setHistory)
      .catch((error) =>
        toast({
          title: "Could not load workouts",
          description: error instanceof Error ? error.message : "The dashboard will keep working with empty workout data."
        })
      );
  }, [toast, user]);

  const totals = useMemo(() => sumFoodLogs(logs), [logs]);
  const remaining = remainingMacros(defaultTargets, totals);

  return (
    <>
      <WelcomePopup />
      <PageHeading
        title={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description="Your simple S&S Gym overview for meals, workouts, water, and progress."
        action={
          <>
            <Button asChild>
              <Link href="/meals">
                <Plus className="h-4 w-4" />
                Add Food
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/my-workout/plans">Start Workout</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Flame} label="Calories eaten" value={`${totals.calories} kcal`} detail={`${remaining.calories} kcal remaining`} progress={percent(totals.calories, defaultTargets.calories)} />
        <MetricCard icon={Soup} label="Protein" value={`${totals.protein_g}g`} detail={`${remaining.protein_g}g remaining`} progress={percent(totals.protein_g, defaultTargets.protein_g)} />
        <MetricCard icon={Droplets} label="Water intake" value="1.8 L" detail="Target 2.5 L today" progress={72} />
        <MetricCard icon={Scale} label="Current weight" value="Add entry" detail="Track from progress page" progress={35} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Macros today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <MacroLine label="Protein" value={totals.protein_g} target={defaultTargets.protein_g} />
            <MacroLine label="Carbs" value={totals.carbs_g} target={defaultTargets.carbs_g} />
            <MacroLine label="Fat" value={totals.fat_g} target={defaultTargets.fat_g} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="outline">
              <Link href="/meals">
                <Utensils className="h-4 w-4" />
                View Meals
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/workouts">
                <Dumbbell className="h-4 w-4" />
                Workout Library
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/my-workout/plans">
                <Dumbbell className="h-4 w-4" />
                My Plans
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/progress">
                <Activity className="h-4 w-4" />
                Add Progress
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/calories">Calorie Tracker</Link>
            </Button>
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
            {!logs.length ? <p className="text-sm text-muted-foreground">No meals logged yet today.</p> : null}
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
            {!history.length ? <p className="text-sm text-muted-foreground">Start a workout to build your history.</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <DashboardCharts macros={totals} />
      </div>
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
