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
  const completedCount = workoutActivity.filter((session) => session.status === "completed").length;
  const skippedCount = workoutActivity.filter((session) => session.status === "skipped").length;

  return (
    <>
      <PageHeading
        title="Progress Tracker"
        description="Track body weight, measurements, workout consistency, and trends by day."
        action={<ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Scale} label="Body weight" value={latest?.body_weight_kg ? `${latest.body_weight_kg} kg` : "No entry"} detail="Latest progress entry" progress={latest ? 65 : 0} />
        <MetricCard icon={Ruler} label="Waist" value={(latest?.measurements?.waist_cm ?? latest?.waist_cm) ? `${latest?.measurements?.waist_cm ?? latest?.waist_cm} cm` : "No entry"} detail="Latest measurement" progress={latest ? 55 : 0} />
        <MetricCard icon={CalendarCheck} label="Completed" value={`${completedCount}`} detail="Workout days finished" progress={Math.min(100, completedCount * 10)} />
        <MetricCard icon={SkipForward} label="Skipped" value={`${skippedCount}`} detail="Workout days skipped" progress={Math.min(100, skippedCount * 10)} />
      </div>
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
