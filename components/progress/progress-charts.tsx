"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProgressEntry, WorkoutSession } from "@/types";

export function ProgressCharts({
  entries,
  workoutActivity = []
}: {
  entries: ProgressEntry[];
  workoutActivity?: WorkoutSession[];
}) {
  const progressData = entries.map((entry) => ({
    date: formatShortDate(entry.entry_date),
    weight: toNumberOrNull(entry.body_weight_kg),
    waist: toNumberOrNull(entry.measurements?.waist_cm ?? entry.waist_cm),
    hips: toNumberOrNull(entry.measurements?.hips_cm),
    chest: toNumberOrNull(entry.measurements?.chest_cm)
  }));

  const workoutData = buildWorkoutData(workoutActivity);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card variant="glassStrong">
        <CardHeader>
          <CardTitle>Body changes</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {progressData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={35} />
                <Tooltip />
                <Line dataKey="weight" name="Weight kg" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
                <Line dataKey="waist" name="Waist cm" stroke="var(--color-secondary)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
                <Line dataKey="hips" name="Hips cm" stroke="var(--color-text-secondary)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
                <Line dataKey="chest" name="Chest cm" stroke="var(--color-success)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartText text="Add progress entries to compare weight and measurements over time." />
          )}
        </CardContent>
      </Card>

      <Card variant="glassStrong">
        <CardHeader>
          <CardTitle>Workout consistency</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {workoutData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workoutData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="completed" name="Completed" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="skipped" name="Skipped" fill="var(--color-warning)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartText text="Complete or skip workouts to see daily consistency." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChartText({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md bg-muted/40 p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function buildWorkoutData(activity: WorkoutSession[]) {
  const byDate = new Map<string, { date: string; completed: number; skipped: number }>();
  activity.forEach((session) => {
    const key = (session.completed_at || session.skipped_at || session.started_at || "").slice(0, 10);
    if (!key) return;
    const current = byDate.get(key) ?? { date: formatShortDate(key), completed: 0, skipped: 0 };
    if (session.status === "completed") current.completed += 1;
    if (session.status === "skipped") current.skipped += 1;
    byDate.set(key, current);
  });
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
