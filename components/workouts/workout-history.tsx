"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Dumbbell, Filter, History, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardSkeleton, EmptyState, ErrorState, SkeletonLine } from "@/components/ui/state-views";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getScheduledWorkoutHistoryWithStatus, getWorkoutHistoryDetailedWithStatus } from "@/services/database/workout-sessions";
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
  status: "completed" | "skipped";
  planId: string | null;
  planDayId: string | null;
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
    status: session.status === "skipped" ? "skipped" : "completed",
    planId: session.plan_id ?? null,
    planDayId: session.plan_day_id ?? null,
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
    date: session.completed_at || session.skipped_at || session.started_at || `${session.scheduled_date}T00:00:00`,
    durationMinutes: session.duration_minutes ?? 0,
    notes: session.notes,
    status: session.status === "skipped" ? "skipped" : "completed",
    planId: session.user_workout_plan_id,
    planDayId: session.plan_day_id,
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
  const searchParams = useSearchParams();
  const highlightedSessionId = searchParams.get("session");
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const { dir, locale, tr } = useTrainTranslation();
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [scheduledHistory, setScheduledHistory] = useState<UserWorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sourceWarnings, setSourceWarnings] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [weekFilter, setWeekFilter] = useState(toIsoWeekInput(new Date()));
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [showFilterDialog, setShowFilterDialog] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setLoadError("");
    setSourceWarnings([]);
    try {
      const [legacyResult, scheduledResult] = await Promise.all([
        getWorkoutHistoryDetailedWithStatus(userId),
        getScheduledWorkoutHistoryWithStatus(userId)
      ]);
      setHistory(legacyResult.data);
      setScheduledHistory(scheduledResult.data);
      const warnings = [legacyResult.status, scheduledResult.status]
        .filter((status) => status.state !== "loaded" && status.message)
        .map((status) => status.message as string);
      setSourceWarnings(Array.from(new Set(warnings)));
      const bothFailed = [legacyResult.status, scheduledResult.status].every((status) => status.state === "failed");
      if (bothFailed) {
        setLoadError("Workout history could not load. Retry before treating this as an empty history.");
      }
    } catch (error) {
      const message = userSafeError(error, tr("planLoadFailedDescription"));
      setHistory([]);
      setScheduledHistory([]);
      setLoadError(message);
      toast({ title: tr("workoutHistory"), description: message });
    } finally {
      setIsLoading(false);
    }
  }, [toast, tr, userId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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
  const isFiltered = filterMode !== "all";
  const activeFilterLabel = filterMode === "week" ? `${tr("week")} ${weekFilter}` : filterMode === "month" ? monthFilter : tr("all");

  function resetDateFilter() {
    setFilterMode("all");
  }

  return (
    <div className="space-y-5" dir={dir}>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <StatSkeleton />
          <StatSkeleton />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border/70 bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{tr("thisWeek")}</p>
            <p className="mt-1 text-xl font-bold">{stats.thisWeek} <span className="text-sm font-normal text-muted-foreground">{tr("workouts")}</span></p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{tr("thisMonth")}</p>
            <p className="mt-1 text-xl font-bold">{stats.thisMonth} <span className="text-sm font-normal text-muted-foreground">{tr("workouts")}</span></p>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <ErrorState
          title="Workout history could not load"
          description={loadError}
          onRetry={loadHistory}
        />
      ) : null}

      {sourceWarnings.length ? (
        <StatusNotice
          tone="warning"
          title="Workout history could not fully load"
          description={`${sourceWarnings.join(" ")} Showing what Plaivra could recover.`}
        />
      ) : null}

      <StatusNotice
        tone={loadError ? "warning" : "default"}
        title={loadError ? "History load failed" : isLoading ? tr("loadingLabel") : `${filteredHistory.length} ${tr("workouts")}`}
        description={`${tr("completed")} / ${tr("skippedToday")} · ${activeFilterLabel}`}
        badges={[isFiltered ? "Filtered" : "All", loadError ? "Failed" : sourceWarnings.length ? "Partial" : "Loaded"]}
      />

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {tr("workoutHistory")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{tr("workoutHistoryDescription")}</p>
          </div>

          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_180px_180px_1fr]">
            <div className="flex flex-wrap gap-2">
              {(["all", "week", "month"] as FilterMode[]).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={filterMode === mode ? "default" : "outline"}
                  onClick={() => setFilterMode(mode)}
                  className="min-h-12 capitalize"
                >
                  {mode === "all" ? tr("all") : mode === "week" ? tr("week") : tr("month")}
                </Button>
              ))}
              <Button variant="outline" className="min-h-12 lg:hidden" onClick={() => setShowFilterDialog(true)}>
                <Filter className="h-4 w-4" /> {tr("date")}
              </Button>
            </div>
            <div className="hidden lg:block">
              <Input className="h-12" type="week" value={weekFilter} onChange={(event) => { setWeekFilter(event.target.value); setFilterMode("week"); }} aria-label={tr("filterWorkoutHistoryWeek")} />
            </div>
            <div className="hidden lg:block">
              <Input className="h-12" type="month" value={monthFilter} onChange={(event) => { setMonthFilter(event.target.value); setFilterMode("month"); }} aria-label={tr("filterWorkoutHistoryMonth")} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {filteredHistory.length} of {totalHistoryCount} workouts
              {isFiltered ? (
                <Button type="button" variant="ghost" className="min-h-12" onClick={resetDateFilter}>
                  <RotateCcw className="h-4 w-4" /> {tr("resetDateFilter")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <CardSkeleton rows={3} /> : null}
          {!isLoading && !loadError && !totalHistoryCount ? (
            <EmptyState
              title={tr("noCompletedWorkouts")}
              description={tr("noCompletedWorkoutsDescription")}
              actionLabel={tr("startAWorkout")}
              actionHref="/my-workout/plans"
            />
          ) : null}
          {!isLoading && !loadError && totalHistoryCount > 0 && !filteredHistory.length ? (
            <EmptyState
              title="No workouts match this filter"
              description="Your completed workout history loaded, but nothing matches the selected date filter."
              actionLabel="Reset date filter"
              onAction={resetDateFilter}
            />
          ) : null}

          {filteredHistory.map((session) => {
            const sessionDate = new Date(session.date);
            const totalSets = session.exercises.reduce((sum, ex) => sum + parseSetCount(ex.sets), 0);
            return (
              <div id={`workout-session-${session.id}`} key={session.id} className={cn("solid-row scroll-mt-24 p-4 transition-colors hover:border-primary/40 hover:bg-muted/30", highlightedSessionId === session.id && "border-primary bg-primary/5 ring-2 ring-primary/20")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{session.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {sessionDate.toLocaleDateString(locale)} · {sessionDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{session.category}</Badge>
                    <Badge variant="outline">{session.durationMinutes} min</Badge>
                    <Badge variant={session.status === "skipped" ? "warning" : "success"}>{session.status === "skipped" ? tr("skippedToday") : tr("completed")}</Badge>
                    {session.planId ? <Button asChild variant="ghost" className="min-h-11 px-2"><Link href={`/my-workout/plans/${session.planId}${session.planDayId ? `?day=${encodeURIComponent(session.planDayId)}` : ""}`}>{tr("viewPlan")}</Link></Button> : null}
                  </div>
                </div>

                <details className="mt-3 group" open={highlightedSessionId === session.id ? true : undefined}>
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 text-sm transition hover:bg-muted/60">
                    <span className="flex min-w-0 flex-col gap-1 py-2 text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                      <span className="flex items-center gap-2">
                        <Dumbbell className="h-4 w-4" />
                        {tr("sessionDetails")}
                      </span>
                      <span>
                        {session.exercises.length} exercises - {totalSets} sets - {session.durationMinutes} min
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                  </summary>
                  {session.exercises.length ? (
                    <div className="mt-2 grid gap-3">
                      {session.exercises.map((exercise) => {
                        return (
                          <div
                            key={`${session.id}-${exercise.id}`}
                            className={cn("solid-row grid gap-3 p-3 text-sm", "lg:grid-cols-[1fr_1.3fr_0.9fr]")}
                          >
                            <div>
                              <p className="font-medium text-foreground">{exercise.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{exercise.category}</p>
                            </div>
                            <div className="grid gap-1">
                              {exercise.setDetails.map((line, lineIndex) => (
                                <p key={`${exercise.id}-set-${lineIndex}`} className="rounded-md bg-muted/40 px-3 py-2 text-foreground">{line}</p>
                              ))}
                            </div>
                            <div className="text-sm leading-6">
                              <p className="font-medium text-foreground">{exercise.sets}</p>
                              {exercise.notes ? <p className="mt-1 text-muted-foreground">{tr("notes")}: {exercise.notes}</p> : <p className="mt-1 text-muted-foreground">{tr("noneSaved")}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="solid-row mt-2 p-3 text-sm text-muted-foreground">{tr("noSetData")}</p>
                  )}
                  {session.notes ? <p className="mt-2 text-sm leading-6 text-muted-foreground">Session notes: {session.notes}</p> : null}
                </details>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto pb-0">
          <DialogHeader>
            <DialogTitle>{tr("filterByDate")}</DialogTitle>
            <DialogDescription>{tr("filterDateDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-sm font-medium">{tr("week")}</Label>
              <Input className="h-12" type="week" value={weekFilter} onChange={(event) => { setWeekFilter(event.target.value); setFilterMode("week"); }} aria-label={tr("filterWorkoutHistoryWeek")} />
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium">{tr("month")}</Label>
              <Input className="h-12" type="month" value={monthFilter} onChange={(event) => { setMonthFilter(event.target.value); setFilterMode("month"); }} aria-label={tr("filterWorkoutHistoryMonth")} />
            </div>
            <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-card/95 p-4 backdrop-blur sm:-mx-6 sm:px-6">
              <Button onClick={() => setShowFilterDialog(false)} className="min-h-12 flex-1">{tr("apply")}</Button>
              <Button variant="outline" className="min-h-12" onClick={() => { resetDateFilter(); setShowFilterDialog(false); }}>
                <RotateCcw className="h-4 w-4" /> {tr("reset")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="glass-card p-3 shadow-soft" aria-busy="true">
      <SkeletonLine className="h-3 w-20" />
      <SkeletonLine className="mt-3 h-6 w-28" />
    </div>
  );
}

function StatusNotice({
  tone,
  title,
  description,
  badges = []
}: {
  tone: "default" | "warning";
  title: string;
  description: string;
  badges?: string[];
}) {
  const Icon = tone === "warning" ? AlertTriangle : CheckCircle2;
  const className = tone === "warning" ? "border-warning/30 bg-warning/10" : "border-primary/20 bg-primary/5";
  const iconClassName = tone === "warning" ? "text-warning" : "text-primary";

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconClassName)} />
          <div>
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {badges.length ? (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => <Badge key={badge} variant={tone === "warning" ? "warning" : "outline"}>{badge}</Badge>)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
