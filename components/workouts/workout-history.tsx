"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, History, TrendingUp, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export function WorkoutHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [scheduledHistory, setScheduledHistory] = useState<UserWorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [weekFilter, setWeekFilter] = useState(toIsoWeekInput(new Date()));
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

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

        {progression.length ? (
          <div className="rounded-md border bg-primary/5 p-4">
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
                <div key={item.exerciseName} className="rounded-md border bg-card p-3">
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
