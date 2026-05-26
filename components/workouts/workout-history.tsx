"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getWorkoutHistoryDetailed } from "@/services/database/repository";
import { cn } from "@/lib/utils";
import type { ExerciseLog, WorkoutSessionSummary } from "@/types";

type FilterMode = "all" | "week" | "month";

function groupLogs(logs: ExerciseLog[]) {
  const groups = new Map<string, ExerciseLog[]>();
  logs.forEach((log) => {
    const key = log.plan_exercise_id || log.exercise_name || log.id;
    groups.set(key, [...(groups.get(key) ?? []), log]);
  });
  return Array.from(groups.values());
}

function totalReps(logs: ExerciseLog[]) {
  return logs.reduce((sum, log) => sum + (Number(log.reps) || 0), 0);
}

function setWeights(logs: ExerciseLog[]) {
  const values = logs
    .map((log) => log.weight_kg)
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map((value) => `${Number(value)} kg`);
  return values.length ? Array.from(new Set(values)).join(", ") : "Bodyweight";
}

function setNotes(logs: ExerciseLog[]) {
  return logs.map((log) => log.notes).filter(Boolean).join("; ");
}

export function WorkoutHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [weekFilter, setWeekFilter] = useState(toIsoWeekInput(new Date()));
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (!user) return;
    let active = true;
    setIsLoading(true);
    getWorkoutHistoryDetailed(user.id)
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch((error) => {
        if (!active) return;
        setHistory([]);
        toast({ title: "Could not load workout history", description: error instanceof Error ? error.message : "Please try again." });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [toast, user]);

  const filteredHistory = useMemo(() => {
    return history.filter((session) => {
      const date = new Date(session.completed_at || session.started_at);
      if (filterMode === "week") return toIsoWeekInput(date) === weekFilter;
      if (filterMode === "month") return date.toISOString().slice(0, 7) === monthFilter;
      return true;
    });
  }, [filterMode, history, monthFilter, weekFilter]);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Workout history
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Completed workouts with date, category, sets, weight, reps, and notes.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[auto_180px_180px_1fr]">
          <div className="flex flex-wrap gap-2">
            {(["all", "week", "month"] as FilterMode[]).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={filterMode === mode ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode(mode)}
                className="capitalize"
              >
                {mode}
              </Button>
            ))}
          </div>
          <Input type="week" value={weekFilter} onChange={(event) => { setWeekFilter(event.target.value); setFilterMode("week"); }} aria-label="Filter workout history by week" />
          <Input type="month" value={monthFilter} onChange={(event) => { setMonthFilter(event.target.value); setFilterMode("month"); }} aria-label="Filter workout history by month" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            {filteredHistory.length} of {history.length} workouts
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading workout history...</p> : null}
        {!isLoading && !filteredHistory.length ? (
          <div className="rounded-md border bg-slate-50 p-4 text-sm text-muted-foreground">
            No completed workouts match this filter.
          </div>
        ) : null}

        {filteredHistory.map((session) => {
          const logs = session.exercise_logs ?? [];
          const groups = groupLogs(logs);
          const sessionDate = new Date(session.completed_at || session.started_at);
          const category = session.workout_category || logs[0]?.exercise_category || "Workout";

          return (
            <div key={session.id} className="rounded-md border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{session.workout_day_name || session.workout_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sessionDate.toLocaleDateString()} at {sessionDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{category}</Badge>
                  <Badge variant="outline">{session.duration_minutes ?? 0} min</Badge>
                  <Badge variant="success">Completed</Badge>
                </div>
              </div>

              {groups.length ? (
                <div className="mt-4 grid gap-2">
                  {groups.map((logsForExercise) => {
                    const first = logsForExercise[0];
                    const notes = setNotes(logsForExercise);
                    return (
                      <div
                        key={`${session.id}-${first?.exercise_name}`}
                        className={cn("grid gap-2 rounded-md bg-slate-50 p-3 text-sm", "lg:grid-cols-[1.2fr_0.7fr_0.7fr_1fr]")}
                      >
                        <div>
                          <p className="font-medium text-slate-950">{first?.exercise_name || session.workout_name}</p>
                          <p className="text-xs text-muted-foreground">{first?.exercise_category || category}</p>
                        </div>
                        <p>{logsForExercise.length} sets</p>
                        <p>{totalReps(logsForExercise)} reps</p>
                        <p className="text-muted-foreground">
                          {setWeights(logsForExercise)}
                          {notes ? ` - ${notes}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">No set details were logged for this workout.</p>
              )}

              {session.notes ? <p className="mt-3 text-sm text-slate-700">Notes: {session.notes}</p> : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function toIsoWeekInput(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}
