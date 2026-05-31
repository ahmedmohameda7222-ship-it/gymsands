"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getGeneratedWorkoutHistory, getWorkoutHistoryDetailed } from "@/services/database/repository";
import { cn } from "@/lib/utils";
import type { ExerciseLog, UserWorkoutSession, WorkoutSessionSummary } from "@/types";

type FilterMode = "all" | "week" | "month";
type HistoryExercise = {
  id: string;
  name: string;
  category: string;
  sets: string;
  setDetails: string[];
  notes: string;
};

type HistoryItem = {
  id: string;
  title: string;
  category: string;
  date: string;
  durationMinutes: number;
  notes: string | null;
  exercises: HistoryExercise[];
};

function groupLogs(logs: ExerciseLog[]) {
  const groups = new Map<string, ExerciseLog[]>();
  logs.forEach((log) => {
    const key = log.plan_exercise_id || (log.exercise_order ? `${log.exercise_order}-${log.exercise_name}` : log.exercise_name || log.id);
    groups.set(key, [...(groups.get(key) ?? []), log].sort((a, b) => a.set_number - b.set_number));
  });
  return Array.from(groups.values());
}

function setNotes(logs: ExerciseLog[]) {
  return logs.map((log) => log.notes).filter(Boolean).join("; ");
}

function formatSetLine(log: Pick<ExerciseLog, "set_number" | "reps" | "weight_kg" | "planned_reps">) {
  const reps = log.reps === null || log.reps === undefined ? log.planned_reps || "Custom reps" : `${log.reps} reps`;
  const weight = log.weight_kg === null || log.weight_kg === undefined ? "" : ` x ${Number(log.weight_kg)}kg`;
  return `Set ${log.set_number}: ${reps}${weight}`;
}

function parseSetCount(value: string | number | null | undefined) {
  if (typeof value === "number") return Math.max(1, value);
  const parsed = value?.match(/\d+/)?.[0];
  return parsed ? Math.max(1, Number(parsed)) : 1;
}

export function WorkoutHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [generatedHistory, setGeneratedHistory] = useState<UserWorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [weekFilter, setWeekFilter] = useState(toIsoWeekInput(new Date()));
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (!user) return;
    let active = true;
    setIsLoading(true);
    Promise.all([getWorkoutHistoryDetailed(user.id), getGeneratedWorkoutHistory(user.id)])
      .then(([legacyItems, generatedItems]) => {
        if (!active) return;
        setHistory(legacyItems);
        setGeneratedHistory(generatedItems);
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
    const items = [...history.map(normalizeLegacyHistory), ...generatedHistory.map(normalizeGeneratedHistory)].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return items.filter((session) => {
      const date = new Date(session.date);
      if (filterMode === "week") return toIsoWeekInput(date) === weekFilter;
      if (filterMode === "month") return date.toISOString().slice(0, 7) === monthFilter;
      return true;
    });
  }, [filterMode, generatedHistory, history, monthFilter, weekFilter]);

  const totalHistoryCount = history.length + generatedHistory.length;

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
            {filteredHistory.length} of {totalHistoryCount} workouts
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
          const sessionDate = new Date(session.date);

          return (
            <div key={session.id} className="rounded-md border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{session.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sessionDate.toLocaleDateString()} at {sessionDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{session.category}</Badge>
                  <Badge variant="outline">{session.durationMinutes} min</Badge>
                  <Badge variant="success">Completed</Badge>
                </div>
              </div>

              {session.exercises.length ? (
                <div className="mt-4 grid gap-2">
                  {session.exercises.map((exercise) => {
                    return (
                      <div
                        key={`${session.id}-${exercise.id}`}
                        className={cn("grid gap-3 rounded-md bg-slate-50 p-3 text-sm", "lg:grid-cols-[1.1fr_1.5fr_0.8fr]")}
                      >
                        <div>
                          <p className="font-medium text-slate-950">{exercise.name}</p>
                          <p className="text-xs text-muted-foreground">{exercise.category}</p>
                        </div>
                        <div className="space-y-1">
                          {exercise.setDetails.map((line, lineIndex) => (
                            <p key={`${exercise.id}-set-${lineIndex}`} className="text-slate-800">{line}</p>
                          ))}
                        </div>
                        <div>
                          <p>{exercise.sets}</p>
                          {exercise.notes ? <p className="mt-1 text-muted-foreground">{exercise.notes}</p> : null}
                        </div>
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

function normalizeLegacyHistory(session: WorkoutSessionSummary): HistoryItem {
  const logs = session.exercise_logs ?? [];
  const groups = groupLogs(logs);
  const category = session.workout_category || logs[0]?.exercise_category || "Workout";
  return {
    id: session.id,
    title: session.workout_day_name || session.workout_name,
    category,
    date: session.completed_at || session.started_at,
    durationMinutes: session.duration_minutes ?? 0,
    notes: session.notes,
    exercises: groups.map((logsForExercise, index) => {
      const first = logsForExercise[0];
      return {
        id: first?.plan_exercise_id || first?.id || `${session.id}-${index}`,
        name: first?.exercise_name || session.workout_name,
        category: first?.exercise_category || category,
        sets: `${logsForExercise.length} sets`,
        setDetails: logsForExercise.map(formatSetLine),
        notes: setNotes(logsForExercise)
      };
    })
  };
}

function normalizeGeneratedHistory(session: UserWorkoutSession): HistoryItem {
  return {
    id: session.id,
    title: session.day_title,
    category: `Week ${session.week_index}`,
    date: session.completed_at || session.started_at || `${session.scheduled_date}T00:00:00`,
    durationMinutes: session.duration_minutes ?? 0,
    notes: session.notes,
    exercises: session.logs.map((log) => {
      const setCount = parseSetCount(log.planned_sets);
      const setDetails = Array.from({ length: setCount }, (_, index) =>
        formatSetLine({
          set_number: index + 1,
          reps: log.reps,
          weight_kg: log.weight_kg,
          planned_reps: log.planned_reps
        })
      );
      return {
        id: log.id,
        name: log.exercise_name,
        category: `${log.planned_sets || "Custom"} sets`,
        sets: log.planned_sets ? `${log.planned_sets} sets` : "Custom",
        setDetails,
        notes: log.notes ?? ""
      };
    })
  };
}
