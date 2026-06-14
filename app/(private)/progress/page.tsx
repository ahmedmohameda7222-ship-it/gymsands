"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, Ruler, Scale, SkipForward } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ProgressEntryModal } from "@/components/progress/progress-entry-modal";
import { ProgressCharts } from "@/components/progress/progress-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getProgressEntries, getWorkoutActivity } from "@/services/database/repository";
import type { ProgressEntry, WorkoutSession } from "@/types";

export default function ProgressPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [workoutActivity, setWorkoutActivity] = useState<WorkoutSession[]>([]);

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

  const latest = entries.at(-1);
  const first = entries[0];
  const previous = entries.length > 1 ? entries.at(-2) : null;
  const weightDelta = latest?.body_weight_kg && first?.body_weight_kg ? round(latest.body_weight_kg - first.body_weight_kg) : null;
  const latestWaist = latest?.measurements?.waist_cm ?? latest?.waist_cm ?? null;
  const firstWaist = first?.measurements?.waist_cm ?? first?.waist_cm ?? null;
  const waistDelta = latestWaist && firstWaist ? round(latestWaist - firstWaist) : null;
  const completedCount = workoutActivity.filter((session) => session.status === "completed").length;
  const skippedCount = workoutActivity.filter((session) => session.status === "skipped").length;
  const totalWorkoutCount = completedCount + skippedCount;
  const completionRate = totalWorkoutCount ? Math.round((completedCount / totalWorkoutCount) * 100) : undefined;

  return (
    <>
      <PageHeading
        title="Progress Tracker"
        description="Track body weight, measurements, workout consistency, and trends by day."
        action={<ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Scale} label="Body weight" value={latest?.body_weight_kg ? `${latest.body_weight_kg} kg` : "No entry"} detail={weightDelta === null ? "No trend yet" : `${formatDelta(weightDelta)} kg from first entry`} />
        <MetricCard icon={Ruler} label="Waist" value={latestWaist ? `${latestWaist} cm` : "No entry"} detail={waistDelta === null ? "No measurement trend yet" : `${formatDelta(waistDelta)} cm from first entry`} />
        <MetricCard icon={CalendarCheck} label="Completed" value={`${completedCount}`} detail="Workout days finished" progress={completionRate} />
        <MetricCard icon={SkipForward} label="Skipped" value={`${skippedCount}`} detail="Workout days skipped" progress={totalWorkoutCount ? Math.round((skippedCount / totalWorkoutCount) * 100) : undefined} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Weekly progress report</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Insight text={entries.length ? `${entries.length} progress entr${entries.length === 1 ? "y" : "ies"} saved.` : "No progress entries yet. Add your first weight or measurement."} />
          <Insight text={completionRate === undefined ? "No workout consistency data yet." : `You completed ${completedCount}/${totalWorkoutCount} tracked workouts.`} />
          <Insight text={previous?.body_weight_kg && latest?.body_weight_kg ? `Last weight change: ${formatDelta(round(latest.body_weight_kg - previous.body_weight_kg))} kg.` : "Add at least two weight entries to see weight velocity."} />
          <Insight text={waistDelta === null ? "Add waist measurements to see waist trend." : `Waist trend: ${formatDelta(waistDelta)} cm.`} />
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
          {entries.map((entry) => (
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

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}
