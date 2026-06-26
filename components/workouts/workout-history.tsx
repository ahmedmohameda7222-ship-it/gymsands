"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Dumbbell, Filter, History, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardSkeleton, EmptyState } from "@/components/ui/state-views";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getScheduledWorkoutHistory, getWorkoutHistoryDetailed } from "@/services/database/workout-sessions";
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

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function normalizeScheduledHistory(session: UserWorkoutSession): HistoryItem {
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

function computeStats(items: HistoryItem[]) {
  if (!items.length) return null;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisWeek = items.filter((i) => new Date(i.date) >= weekStart).length;
  const thisMonth = items.filter((i) => new Date(i.date) >= monthStart).length;
  return { thisWeek, thisMonth };
}

export function WorkoutHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [scheduledHistory, setScheduledHistory] = useState<UserWorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [weekFilter, setWeekFilter] = useState(toIsoWeekInput(new Date()));
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [showFilterDialog, setShowFilterDialog] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setIsLoading(true);
    Promise.all([getWorkoutHistoryDetailed(user.id), getScheduledWorkoutHistory(user.id)])
      .then(([legacyItems, scheduledItems]) => {
        if (!active) return;
        setHistory(legacyItems);
        setScheduledHistory(scheduledItems);
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
    const items = [...history.map(normalizeLegacyHistory), ...scheduledHistory.map(normalizeScheduledHistory)].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return items.filter((session) => {
      const date = new Date(session.date);
      if (filterMode === "week") return toIsoWeekInput(date) === weekFilter;
      if (filterMode === "month") return date.toISOString().slice(0, 7) === monthFilter;
      return true;
    });
  }, [filterMode, scheduledHistory, history, monthFilter, weekFilter]);

  const totalHistoryCount = history.length + scheduledHistory.length;
  const stats = useMemo(() => computeStats([...history.map(normalizeLegacyHistory), ...scheduledHistory.map(normalizeScheduledHistory)]), [history, scheduledHistory]);

  return (
    <div className="space-y-5">
      {stats && !isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-3 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">This week</p>
            <p className="mt-1 text-xl font-bold">{stats.thisWeek} <span className="text-sm font-normal text-muted-foreground">workouts</span></p>
          </div>
          <div className="glass-card p-3 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">This month</p>
            <p className="mt-1 text-xl font-bold">{stats.thisMonth} <span className="text-sm font-normal text-muted-foreground">workouts</span></p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Workout history
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Completed workouts with date, category, sets, weight, reps, and notes.</p>
          </div>

          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_180px_180px_1fr]">
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
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowFilterDialog(true)}>
                <Filter className="h-4 w-4" /> Date
              </Button>
            </div>
            <div className="hidden lg:block">
              <Input type="week" value={weekFilter} onChange={(event) => { setWeekFilter(event.target.value); setFilterMode("week"); }} aria-label="Filter workout history by week" />
            </div>
            <div className="hidden lg:block">
              <Input type="month" value={monthFilter} onChange={(event) => { setMonthFilter(event.target.value); setFilterMode("month"); }} aria-label="Filter workout history by month" />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {filteredHistory.length} of {totalHistoryCount} workouts
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <CardSkeleton rows={3} /> : null}
          {!isLoading && !filteredHistory.length ? (
            <EmptyState
              title="No completed workouts"
              description="Start a workout session and log your sets to see your history here."
              actionLabel="Start a workout"
              actionHref="/today-workout"
            />
          ) : null}

          {filteredHistory.map((session) => {
            const sessionDate = new Date(session.date);
            const totalSets = session.exercises.reduce((sum, ex) => sum + parseSetCount(ex.sets), 0);
            return (
              <div key={session.id} className="solid-row p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{session.title}</p>
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

                <details className="mt-3 group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 text-sm transition hover:bg-muted/60">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Dumbbell className="h-4 w-4" />
                      {session.exercises.length} exercises · {totalSets} sets · {session.durationMinutes} min
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
                  </summary>
                  {session.exercises.length ? (
                    <div className="mt-2 grid gap-2">
                      {session.exercises.map((exercise) => {
                        return (
                          <div
                            key={`${session.id}-${exercise.id}`}
                            className={cn("solid-row grid gap-3 p-3 text-sm", "lg:grid-cols-[1.1fr_1.5fr_0.8fr]")}
                          >
                            <div>
                              <p className="font-medium text-foreground">{exercise.name}</p>
                              <p className="text-xs text-muted-foreground">{exercise.category}</p>
                            </div>
                            <div className="space-y-1">
                              {exercise.setDetails.map((line, lineIndex) => (
                                <p key={`${exercise.id}-set-${lineIndex}`} className="text-foreground">{line}</p>
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
                    <p className="solid-row mt-2 p-3 text-sm text-muted-foreground">No set details were logged for this workout.</p>
                  )}
                  {session.notes ? <p className="mt-2 text-sm text-muted-foreground">Notes: {session.notes}</p> : null}
                </details>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filter by date</DialogTitle>
            <DialogDescription>Choose a week or month to narrow your history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-sm font-medium">Week</Label>
              <Input type="week" value={weekFilter} onChange={(event) => { setWeekFilter(event.target.value); setFilterMode("week"); }} aria-label="Filter workout history by week" />
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium">Month</Label>
              <Input type="month" value={monthFilter} onChange={(event) => { setMonthFilter(event.target.value); setFilterMode("month"); }} aria-label="Filter workout history by month" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowFilterDialog(false)} className="flex-1">Apply</Button>
              <Button variant="outline" onClick={() => { setFilterMode("all"); setShowFilterDialog(false); }}>Reset</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
