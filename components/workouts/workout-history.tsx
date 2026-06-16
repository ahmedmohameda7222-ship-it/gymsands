"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, ChevronDown, Clock, Dumbbell, Filter, Flame, History, Layers, TrendingUp, Trophy, X } from "lucide-react";
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

type ProgressionLog = {
  sessionId: string;
  exerciseName: string;
  date: string;
  reps: number | null;
  weightKg: number | null;
  plannedReps: string | null;
};

function buildWorkoutProgression(legacy: WorkoutSessionSummary[], scheduled: UserWorkoutSession[]) {
  const logs: ProgressionLog[] = [
    ...legacy.flatMap((session) =>
      (session.exercise_logs ?? []).map((log) => ({
        sessionId: session.id,
        exerciseName: log.exercise_name,
        date: session.completed_at || session.started_at,
        reps: log.reps,
        weightKg: log.weight_kg,
        plannedReps: log.planned_reps
      }))
    ),
    ...scheduled.flatMap((session) =>
      (session.logs ?? []).map((log) => ({
        sessionId: session.id,
        exerciseName: log.exercise_name,
        date: session.completed_at || session.started_at || `${session.scheduled_date}T00:00:00`,
        reps: log.reps,
        weightKg: log.weight_kg,
        plannedReps: log.planned_reps
      }))
    )
  ].filter((log) => log.exerciseName && (log.reps !== null || log.weightKg !== null));

  const grouped = new Map<string, ProgressionLog[]>();
  logs.forEach((log) => {
    const key = normalizeText(log.exerciseName);
    grouped.set(key, [...(grouped.get(key) ?? []), log]);
  });

  return Array.from(grouped.values())
    .map((items) => {
      const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const latestDate = sorted.at(-1)?.date ?? "";
      const latestSessionId = sorted.at(-1)?.sessionId;
      const latestSessionLogs = sorted.filter((log) => log.sessionId === latestSessionId);
      const topTargetReps = parseTopReps(latestSessionLogs.find((log) => log.plannedReps)?.plannedReps);
      const latestWeights = latestSessionLogs.map((log) => log.weightKg).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const latestReps = latestSessionLogs.map((log) => log.reps).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const maxWeight = latestWeights.length ? Math.max(...latestWeights) : null;
      const hitTopReps = Boolean(topTargetReps && latestReps.length && latestReps.every((reps) => reps >= topTargetReps));
      const missedTarget = Boolean(topTargetReps && latestReps.some((reps) => reps < topTargetReps));
      const suggestion = hitTopReps && maxWeight
        ? `Hit the top of the planned rep range. Try a small weight increase next time.`
        : missedTarget
          ? `Repeat the same weight next time until the planned reps are cleaner.`
          : `Keep logging reps and weight to make the next progression call clearer.`;
      const bestWeight = maxNumber(sorted.map((log) => log.weightKg));
      const bestReps = maxNumber(sorted.map((log) => log.reps));
      const bestVolume = maxNumber(sorted.map((log) => volume(log)));
      const volumes = sessionVolumes(sorted);
      const oneRepMaxes = sorted.map(estimatedOneRepMax).filter((value): value is number => value !== null);

      return {
        exerciseName: sorted[0].exerciseName,
        latestDate,
        suggestion,
        prLine: [
          bestWeight ? `${bestWeight}kg` : null,
          bestReps ? `${bestReps} reps` : null,
          bestVolume ? `${Math.round(bestVolume)}kg volume` : null
        ].filter(Boolean).join(" | ") || "No numeric PR yet",
        volumeTrend: trendLine(volumes.map((item) => item.volume), "kg"),
        oneRepMaxTrend: trendLine(oneRepMaxes, "kg")
      };
    })
    .sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime())
    .slice(0, 4);
}

function parseTopReps(value: string | null | undefined) {
  const numbers = (value ?? "").match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  return numbers.length ? Math.max(...numbers) : null;
}

function maxNumber(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? Math.max(...valid) : null;
}

function volume(log: ProgressionLog) {
  return typeof log.weightKg === "number" && typeof log.reps === "number" ? log.weightKg * log.reps : null;
}

function sessionVolumes(logs: ProgressionLog[]) {
  const bySession = new Map<string, { date: string; volume: number }>();
  logs.forEach((log) => {
    const current = bySession.get(log.sessionId) ?? { date: log.date, volume: 0 };
    current.volume += volume(log) ?? 0;
    bySession.set(log.sessionId, current);
  });
  return Array.from(bySession.values()).filter((item) => item.volume > 0).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function estimatedOneRepMax(log: ProgressionLog) {
  if (typeof log.weightKg !== "number" || typeof log.reps !== "number" || log.weightKg <= 0 || log.reps <= 0) return null;
  return Math.round(log.weightKg * (1 + log.reps / 30) * 10) / 10;
}

function trendLine(values: number[], unit: string) {
  if (values.length < 2) return "Not enough data";
  const latest = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? 0;
  const delta = Math.round((latest - previous) * 10) / 10;
  if (delta === 0) return `Flat at ${Math.round(latest)}${unit}`;
  return `${delta > 0 ? "+" : ""}${delta}${unit} vs previous`;
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
  let totalSets = 0;
  const muscleCounts = new Map<string, number>();
  items.forEach((item) => {
    item.exercises.forEach((ex) => {
      const count = parseSetCount(ex.sets);
      totalSets += count;
      const muscle = ex.category || "General";
      muscleCounts.set(muscle, (muscleCounts.get(muscle) || 0) + 1);
    });
  });
  const mostTrained = Array.from(muscleCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  return { thisWeek, thisMonth, totalSets, mostTrained };
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
  const progression = useMemo(() => buildWorkoutProgression(history, scheduledHistory), [history, scheduledHistory]);
  const stats = useMemo(() => computeStats([...history.map(normalizeLegacyHistory), ...scheduledHistory.map(normalizeScheduledHistory)]), [history, scheduledHistory]);
  const latestHighlight = progression[0] ?? null;

  return (
    <div className="space-y-5">
      {stats && !isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-border/70 bg-card p-3 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">This week</p>
            <p className="mt-1 text-xl font-bold">{stats.thisWeek} <span className="text-sm font-normal text-muted-foreground">workouts</span></p>
          </div>
          <div className="rounded-md border border-border/70 bg-card p-3 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">This month</p>
            <p className="mt-1 text-xl font-bold">{stats.thisMonth} <span className="text-sm font-normal text-muted-foreground">workouts</span></p>
          </div>
          <div className="rounded-md border border-border/70 bg-card p-3 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Total sets</p>
            <p className="mt-1 text-xl font-bold">{stats.totalSets}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-card p-3 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Top muscle</p>
            <p className="mt-1 text-lg font-bold leading-6">{stats.mostTrained}</p>
          </div>
        </div>
      ) : null}

      {latestHighlight ? (
        <div className="rounded-md border border-border/70 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Trophy className="h-4 w-4 text-primary" /> Latest highlight: {latestHighlight.exerciseName}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{latestHighlight.prLine}</p>
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

          {progression.length ? (
            <div className="rounded-md border border-border/70 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Smart workout progression
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Suggestions use logged sets, reps, weights, and planned rep ranges only.</p>
                </div>
                <Badge variant="outline">{progression.length} exercise insights</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {progression.map((item) => (
                  <div key={item.exerciseName} className="rounded-md border border-border/70 bg-card p-3">
                    <p className="font-semibold">{item.exerciseName}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{item.suggestion}</p>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-primary" /> PR: {item.prLine}</span>
                      <span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5 text-primary" /> Volume: {item.volumeTrend}</span>
                      <span>Estimated 1RM: {item.oneRepMaxTrend}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !isLoading ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <TrendingUp className="h-5 w-5 text-primary" />
                Smart workout progression
              </p>
              <p className="mt-1">Log completed workouts with reps and weights to unlock progression suggestions.</p>
            </div>
          ) : null}

          {filteredHistory.map((session) => {
            const sessionDate = new Date(session.date);
            const totalSets = session.exercises.reduce((sum, ex) => sum + parseSetCount(ex.sets), 0);
            return (
              <div key={session.id} className="rounded-md border border-border/70 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
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
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md bg-muted/40 px-3 text-sm transition hover:bg-muted/60">
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
                            className={cn("grid gap-3 rounded-md bg-muted/40 p-3 text-sm", "lg:grid-cols-[1.1fr_1.5fr_0.8fr]")}
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
                    <p className="mt-2 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">No set details were logged for this workout.</p>
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
