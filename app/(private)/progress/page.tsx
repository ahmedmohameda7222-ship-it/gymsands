"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, Ruler, Scale, SkipForward, Target, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ProgressEntryModal } from "@/components/progress/progress-entry-modal";
import { ProgressCharts } from "@/components/progress/progress-charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getProgressEntries, getWorkoutActivity } from "@/services/database/repository";
import type { ProgressEntry, WorkoutSession } from "@/types";

const GOAL_WEIGHT_STORAGE_KEY = "fitlife_goal_weight_kg";

export default function ProgressPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [workoutActivity, setWorkoutActivity] = useState<WorkoutSession[]>([]);
  const [goalWeight, setGoalWeight] = useState("");

  useEffect(() => {
    if (!user) return;
    Promise.all([getProgressEntries(user.id), getWorkoutActivity(user.id)])
      .then(([progressEntries, activity]) => {
        setEntries(progressEntries);
        setWorkoutActivity(activity);
      })
      .catch((error) =>
        toast({
          title: "Could not load progress",
          description: error instanceof Error ? error.message : "Please refresh and try again."
        })
      );
  }, [toast, user]);

  useEffect(() => {
    const storedGoal = window.localStorage.getItem(GOAL_WEIGHT_STORAGE_KEY);
    if (storedGoal) setGoalWeight(storedGoal);
  }, []);

  const sortedEntries = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const weightEntries = sortedEntries.filter((entry) => typeof entry.body_weight_kg === "number") as Array<ProgressEntry & { body_weight_kg: number }>;
  const latestWeightEntry = weightEntries.at(-1) ?? null;
  const firstWeightEntry = weightEntries[0] ?? null;
  const previousWeightEntry = weightEntries.length > 1 ? weightEntries.at(-2) ?? null : null;
  const latest = sortedEntries.at(-1);
  const first = sortedEntries[0];
  const weightDelta = latestWeightEntry && firstWeightEntry ? round(latestWeightEntry.body_weight_kg - firstWeightEntry.body_weight_kg) : null;
  const latestWaist = latest?.measurements?.waist_cm ?? latest?.waist_cm ?? null;
  const firstWaist = first?.measurements?.waist_cm ?? first?.waist_cm ?? null;
  const waistDelta = latestWaist && firstWaist ? round(latestWaist - firstWaist) : null;
  const completedCount = workoutActivity.filter((session) => session.status === "completed").length;
  const skippedCount = workoutActivity.filter((session) => session.status === "skipped").length;
  const totalWorkoutCount = completedCount + skippedCount;
  const completionRate = totalWorkoutCount ? Math.round((completedCount / totalWorkoutCount) * 100) : undefined;
  const sevenDayAverage = averageWeight(weightEntries, 7);
  const thirtyDayAverage = averageWeight(weightEntries, 30);
  const latestWeightChange = previousWeightEntry && latestWeightEntry ? round(latestWeightEntry.body_weight_kg - previousWeightEntry.body_weight_kg) : null;
  const numericGoalWeight = Number(goalWeight);
  const targetDateEstimate = estimateTargetDate(weightEntries, numericGoalWeight);
  const consistencyScore = calculateConsistencyScore({ entries: sortedEntries, completedCount, skippedCount });

  function saveGoalWeight() {
    if (!numericGoalWeight || numericGoalWeight < 25 || numericGoalWeight > 300) {
      toast({ title: "Check goal weight", description: "Enter a realistic goal weight in kilograms." });
      return;
    }
    window.localStorage.setItem(GOAL_WEIGHT_STORAGE_KEY, String(numericGoalWeight));
    toast({ title: "Goal weight saved", description: "The goal is saved in this browser until profile-level goal storage is added." });
  }

  return (
    <>
      <PageHeading
        title="Progress Tracker"
        description="Track body weight, measurements, workout consistency, and real trend insights."
        action={<ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Scale} label="Body weight" value={latestWeightEntry ? `${latestWeightEntry.body_weight_kg} kg` : "No entry"} detail={weightDelta === null ? "No trend yet" : `${formatDelta(weightDelta)} kg from first entry`} />
        <MetricCard icon={TrendingUp} label="7-day average" value={sevenDayAverage === null ? "Not enough data" : `${sevenDayAverage} kg`} detail="Average from real weight entries only" />
        <MetricCard icon={TrendingDown} label="30-day average" value={thirtyDayAverage === null ? "Not enough data" : `${thirtyDayAverage} kg`} detail="Longer-term weight trend" />
        <MetricCard icon={Target} label="Goal estimate" value={numericGoalWeight ? `${numericGoalWeight} kg` : "No goal"} detail={targetDateEstimate} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Goal line</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label>Goal weight, kg</Label>
            <Input type="number" value={goalWeight} onChange={(event) => setGoalWeight(event.target.value)} placeholder="Example: 78" />
            <p className="text-xs text-muted-foreground">Saved locally in this browser. No fake goal is shown when this is empty.</p>
          </div>
          <Button className="self-end" onClick={saveGoalWeight}>Save goal</Button>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Ruler} label="Waist" value={latestWaist ? `${latestWaist} cm` : "No entry"} detail={waistDelta === null ? "No measurement trend yet" : `${formatDelta(waistDelta)} cm from first entry`} />
        <MetricCard icon={CalendarCheck} label="Completed" value={`${completedCount}`} detail="Workout days finished" progress={completionRate} />
        <MetricCard icon={SkipForward} label="Skipped" value={`${skippedCount}`} detail="Workout days skipped" progress={totalWorkoutCount ? Math.round((skippedCount / totalWorkoutCount) * 100) : undefined} />
        <MetricCard icon={Target} label="Consistency" value={`${consistencyScore}%`} detail="Based on progress entries and workout completion" progress={consistencyScore} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Weekly progress insights</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Insight text={entries.length ? `${entries.length} progress entr${entries.length === 1 ? "y" : "ies"} saved.` : "No progress entries yet. Add your first weight or measurement."} />
          <Insight text={completionRate === undefined ? "No workout consistency data yet." : `You completed ${completedCount}/${totalWorkoutCount} tracked workouts.`} />
          <Insight text={latestWeightChange === null ? "Add at least two weight entries to see weight velocity." : `Last weight change: ${formatDelta(latestWeightChange)} kg.`} />
          <Insight text={sevenDayAverage === null || thirtyDayAverage === null ? "Not enough data yet for a reliable 7/30-day weight trend." : `7-day average is ${formatDelta(round(sevenDayAverage - thirtyDayAverage))} kg vs 30-day average.`} />
          <Insight text={waistDelta === null ? "Add waist measurements to see waist trend." : `Waist trend: ${formatDelta(waistDelta)} cm.`} />
          <Insight text={targetDateEstimate} />
          <Insight text={consistencyScore < 50 ? "Consistency is still low. Add more logs and complete planned workouts." : `Consistency score is ${consistencyScore}%.`} />
          <Insight text={numericGoalWeight ? "Goal line is active for this browser session." : "Set a goal weight to show a target line estimate."} />
        </CardContent>
      </Card>
      <div className="mt-4">
        <ProgressCharts entries={entries} workoutActivity={workoutActivity} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Progress history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedEntries.map((entry) => (
            <div key={entry.id} className="rounded-md border p-3">
              <p className="font-semibold">{entry.entry_date}</p>
              <p className="text-sm text-muted-foreground">
                {entry.body_weight_kg ? `${entry.body_weight_kg} kg` : "No weight"} | {(entry.measurements?.waist_cm ?? entry.waist_cm) ? `${entry.measurements?.waist_cm ?? entry.waist_cm} cm waist` : "No waist"}
              </p>
              <MeasurementList entry={entry} />
              {entry.notes ? <p className="mt-2 text-sm text-slate-600">{entry.notes}</p> : null}
            </div>
          ))}
          {!entries.length ? <p className="text-sm text-muted-foreground">No progress entries yet.</p> : null}
        </CardContent>
      </Card>
    </>
  );
}

function MeasurementList({ entry }: { entry: ProgressEntry }) {
  const measurement = entry.measurements;
  if (!measurement) return null;
  const allValues: Array<[string, number | null | undefined]> = [
    ["Hips", measurement.hips_cm],
    ["Chest", measurement.chest_cm],
    ["Bust", measurement.bust_cm],
    ["Underbust", measurement.underbust_cm],
    ["Neck", measurement.neck_cm],
    ["Shoulders", measurement.shoulders_cm],
    ["Left arm", measurement.left_arm_cm],
    ["Right arm", measurement.right_arm_cm],
    ["Left thigh", measurement.left_thigh_cm],
    ["Right thigh", measurement.right_thigh_cm],
    ["Glutes", measurement.glutes_cm],
    ["Calves", measurement.calves_cm]
  ];
  const values = allValues.filter((item): item is [string, number] => item[1] !== null && item[1] !== undefined);

  if (!values.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {values.map(([label, value]) => (
        <span key={label} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
          {label}: {value} cm
        </span>
      ))}
    </div>
  );
}

function Insight({ text }: { text: string }) {
  return <div className="rounded-md border bg-slate-50 p-3 text-sm text-muted-foreground">{text}</div>;
}

function averageWeight(entries: Array<ProgressEntry & { body_weight_kg: number }>, days: number) {
  const latest = entries.at(-1);
  if (!latest) return null;
  const cutoff = new Date(latest.entry_date);
  cutoff.setDate(cutoff.getDate() - days + 1);
  const values = entries.filter((entry) => new Date(entry.entry_date) >= cutoff).map((entry) => entry.body_weight_kg);
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function estimateTargetDate(entries: Array<ProgressEntry & { body_weight_kg: number }>, goalWeight: number) {
  if (!goalWeight) return "No goal weight set.";
  if (entries.length < 2) return "Not enough data yet to estimate a target date.";
  const first = entries[0];
  const latest = entries.at(-1)!;
  const elapsedDays = Math.max(1, daysBetween(first.entry_date, latest.entry_date));
  const dailyChange = (latest.body_weight_kg - first.body_weight_kg) / elapsedDays;
  const remainingKg = goalWeight - latest.body_weight_kg;
  if (Math.abs(dailyChange) < 0.01) return "Weight trend is too flat to estimate a target date yet.";
  if ((remainingKg < 0 && dailyChange >= 0) || (remainingKg > 0 && dailyChange <= 0)) return "Current trend is moving away from the goal.";
  const daysToGoal = Math.ceil(Math.abs(remainingKg / dailyChange));
  if (!Number.isFinite(daysToGoal) || daysToGoal > 730) return "Not enough reliable trend data for an estimated date.";
  const estimate = new Date(latest.entry_date);
  estimate.setDate(estimate.getDate() + daysToGoal);
  return `Estimated target date: ${estimate.toISOString().slice(0, 10)}.`;
}

function calculateConsistencyScore({ entries, completedCount, skippedCount }: { entries: ProgressEntry[]; completedCount: number; skippedCount: number }) {
  const progressScore = Math.min(40, entries.length * 8);
  const totalWorkouts = completedCount + skippedCount;
  const workoutScore = totalWorkouts ? Math.round((completedCount / totalWorkouts) * 60) : 0;
  return Math.min(100, progressScore + workoutScore);
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(start).getTime();
  const endDate = new Date(end).getTime();
  return Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}
