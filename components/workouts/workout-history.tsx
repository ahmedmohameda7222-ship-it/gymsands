"use client";

import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getWorkoutHistoryDetailed } from "@/services/database/repository";
import type { ExerciseLog, WorkoutSessionSummary } from "@/types";

function groupLogs(logs: ExerciseLog[]) {
  const groups = new Map<string, ExerciseLog[]>();
  logs.forEach((log) => {
    const key = log.plan_exercise_id || log.exercise_name;
    groups.set(key, [...(groups.get(key) ?? []), log]);
  });
  return Array.from(groups.values());
}

function totalReps(logs: ExerciseLog[]) {
  return logs.reduce((sum, log) => sum + (log.reps ?? 0), 0);
}

function plannedTotal(logs: ExerciseLog[]) {
  const first = logs[0];
  const plannedSets = first?.planned_sets ?? logs.length;
  const plannedReps = first?.planned_reps ?? "";
  const firstPlannedNumber = Number(plannedReps.match(/\d+/)?.[0] ?? 0);
  return firstPlannedNumber ? plannedSets * firstPlannedNumber : null;
}

export function WorkoutHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    getWorkoutHistoryDetailed(user.id)
      .then(setHistory)
      .catch((error) => {
        setHistory([]);
        toast({ title: "Could not load workout history", description: error instanceof Error ? error.message : "Please try again." });
      })
      .finally(() => setIsLoading(false));
  }, [toast, user]);

  const completedCount = useMemo(() => history.length, [history]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Workout history</CardTitle>
        <p className="text-sm text-muted-foreground">Review planned sets and reps against what was actually completed.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading workout history...</p> : null}
        {!isLoading && !completedCount ? <p className="text-sm text-muted-foreground">No completed workouts yet.</p> : null}
        {history.map((session) => (
          <div key={session.id} className="rounded-md border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{session.workout_day_name || session.workout_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{new Date(session.started_at).toLocaleString()} | {session.duration_minutes ?? 0} min</p>
              </div>
              <Badge>{session.exercise_logs.length} sets</Badge>
            </div>
            <div className="mt-4 space-y-2">
              {groupLogs(session.exercise_logs).map((logs) => {
                const planned = plannedTotal(logs);
                const actual = totalReps(logs);
                const difference = planned === null ? null : actual - planned;
                return (
                  <div key={`${session.id}-${logs[0]?.exercise_name}`} className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
                    <p className="font-medium">{logs[0]?.exercise_name}</p>
                    <p>Planned: {logs[0]?.planned_sets ?? logs.length} sets | {logs[0]?.planned_reps ?? "-"}</p>
                    <p>Actual: {logs.length} sets | {actual} reps</p>
                    <p className={difference !== null && difference >= 0 ? "text-emerald-700" : "text-orange-700"}>
                      Difference: {difference === null ? "-" : difference > 0 ? `+${difference} reps` : `${difference} reps`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
