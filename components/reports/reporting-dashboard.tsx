"use client";

import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, RefreshCcw, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardGridSkeleton, CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { useAuth } from "@/components/auth/auth-provider";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { getNutritionWeek } from "@/services/database/nutrition";
import { getPersonalRecords, getProgressEntries } from "@/services/database/progress";
import { getWorkoutActivity } from "@/services/database/workout-sessions";
import { getFitnessHabitHistory, getSleepRecoveryHistory, type EnhancedSleepRecoveryLog } from "@/services/wellness/wellness-data";
import {
  addDays,
  aggregateReport,
  buildMonthRange,
  buildWeekRange,
  datesInRange,
  downloadCsv,
  formatDelta,
  reportMetrics,
  reportToCsv,
  startOfWeek,
  type AggregatedReport,
  type ReportMetric,
  type ReportRange
} from "@/services/reports/reporting";
import type { DailyNutritionSummary, FitnessHabit, PersonalRecord, ProgressEntry, WorkoutSession } from "@/types";

type Mode = "weekly" | "monthly";
type SourceState = "complete" | "partial" | "failed" | "no-data" | "insufficient-data";
type ReportHealth = "complete" | "partial" | "failed" | "no-data" | "insufficient-data";
type SourceCoverage = {
  id: "nutrition" | "workouts" | "progress" | "habits" | "sleep" | "prs";
  label: string;
  state: SourceState;
  detail: string;
  actionHref: string;
  actionLabel: string;
};
type SourceResult<T> = { ok: true; data: T } | { ok: false; data: T; error: string };
type ExportStatus = { type: "success" | "error"; message: string } | null;

export function ReportingDashboard() {
  const { user } = useAuth();
  const today = useTodayDate();
  const [mode, setMode] = useState<Mode>("weekly");
  const [selectedDate, setSelectedDate] = useState(today);
  const [report, setReport] = useState<AggregatedReport | null>(null);
  const [sourceCoverage, setSourceCoverage] = useState<SourceCoverage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [exportStatus, setExportStatus] = useState<ExportStatus>(null);

  const range = useMemo(() => mode === "weekly" ? buildWeekRange(selectedDate) : buildMonthRange(selectedDate), [mode, selectedDate]);
  const metrics = report ? reportMetrics(report, mode) : [];
  const reportHealth = sourceCoverage.length ? getReportHealth(sourceCoverage) : "no-data";

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user?.id) {
        setIsLoading(false);
        setLoadError("Please sign in again before viewing private report data.");
        return;
      }
      setIsLoading(true);
      setLoadError(null);
      setExportStatus(null);
      const [nutritionResult, workoutsResult, progressResult, habitsResult, sleepResult, prsResult] = await Promise.all([
        loadSource(() => getNutritionForRange(user.id, range, { throwOnError: true }), [] as DailyNutritionSummary[]),
        loadSource(() => getWorkoutActivity(user.id, 500, { throwOnError: true }), [] as WorkoutSession[]),
        loadSource(() => getProgressEntries(user.id, { throwOnError: true }), [] as ProgressEntry[]),
        loadSource(() => getFitnessHabitHistory(user.id, 450, { throwOnError: true }), [] as FitnessHabit[]),
        loadSource(() => getSleepRecoveryHistory(user.id, 450, { throwOnError: true }), [] as EnhancedSleepRecoveryLog[]),
        loadSource(() => getPersonalRecords(user.id, 500, { throwOnError: true }), [] as PersonalRecord[])
      ]);
      if (!active) return;

      const nextReport = aggregateReport({
        range,
        nutrition: nutritionResult.data,
        workouts: workoutsResult.data,
        progressEntries: progressResult.data,
        habits: habitsResult.data,
        sleepLogs: sleepResult.data,
        personalRecords: prsResult.data
      });
      const coverage = buildSourceCoverage({
        range,
        report: nextReport,
        nutrition: nutritionResult,
        workouts: workoutsResult,
        progressEntries: progressResult,
        habits: habitsResult,
        sleepLogs: sleepResult,
        personalRecords: prsResult
      });

      setSourceCoverage(coverage);
      if (coverage.every((source) => source.state === "failed")) {
        setReport(null);
        setLoadError("Report sources could not load. Retry before trusting this period.");
      } else {
        setReport(nextReport);
      }
      setIsLoading(false);
    }
    load().catch((error) => {
      if (!active) return;
      setReport(null);
      setLoadError(error instanceof Error ? error.message : "Could not build a report for this period.");
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [range, reloadKey, user?.id]);

  function movePeriod(delta: number) {
    if (mode === "weekly") setSelectedDate(addDays(selectedDate, delta * 7));
    else {
      const date = new Date(`${selectedDate}T00:00:00`);
      date.setMonth(date.getMonth() + delta);
      setSelectedDate(date.toISOString().slice(0, 10));
    }
  }

  function retry() {
    setReloadKey((current) => current + 1);
  }

  function exportCsv() {
    if (!report) return;
    try {
      downloadCsv(`plaivra-${report.range.kind}-report-${report.range.start}-${report.range.end}.csv`, reportToCsv(report));
      setExportStatus({ type: "success", message: "CSV export prepared. Keep downloaded health data private on this device." });
    } catch (error) {
      setExportStatus({ type: "error", message: error instanceof Error ? error.message : "CSV export failed. Please try again." });
    }
  }

  return (
    <div className="space-y-5">
      <Card variant="glass">
        <CardContent className="grid gap-4 pt-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{mode === "weekly" ? "Weekly report" : "Monthly report"}</Badge>
              <Badge variant="outline">{range.label}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Report built from logged workouts, food, water, progress, habits, sleep, and PRs. Averages use only days with saved logs.
            </p>
          </div>
          <div className="grid gap-2 sm:min-w-[360px]">
            <div className="grid grid-cols-2 gap-2 rounded-[16px] border border-border/70 bg-card p-1">
              <Button className="min-h-12" variant={mode === "weekly" ? "default" : "ghost"} onClick={() => setMode("weekly")}>Weekly</Button>
              <Button className="min-h-12" variant={mode === "monthly" ? "default" : "ghost"} onClick={() => setMode("monthly")}>Monthly</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button className="min-h-12" variant="outline" onClick={() => movePeriod(-1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
              <Button className="min-h-12" variant="outline" onClick={() => setSelectedDate(today)}>Current</Button>
              <Button className="min-h-12" variant="outline" onClick={() => movePeriod(1)}>Next <ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="min-h-12" variant="outline" onClick={retry} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Refresh
              </Button>
              <Button className="min-h-12" variant="outline" onClick={exportCsv} disabled={!report}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {exportStatus ? <ExportStatusBanner status={exportStatus} /> : null}
      {isLoading && report ? <LoadingOverlayLabel /> : null}
      {isLoading && !report ? <ReportSkeleton /> : null}
      {!isLoading && loadError && !report ? <ErrorState title="Could not build this report" description={loadError} onRetry={retry} /> : null}

      {report ? (
        <>
          <ReportConfidence health={reportHealth} />
          <MetricGrid metrics={metrics} />
          <SourceCoverageGrid sources={sourceCoverage} />
          {(reportHealth === "no-data" || reportHealth === "insufficient-data" || reportHealth === "partial") ? <EmptyReportGuidance sources={sourceCoverage} /> : null}
          <ReportDetails report={report} mode={mode} />
        </>
      ) : null}
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: ReportMetric[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => (
        <Card key={metric.label} variant="glass" className={metric.empty ? "border-dashed" : undefined}>
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-xl font-bold text-foreground">{metric.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{metric.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReportConfidence({ health }: { health: ReportHealth }) {
  const content = {
    complete: ["Report coverage looks complete", "Core sources loaded and contain enough saved data for this period."],
    partial: ["Partial report", "Some data sources could not load. Metrics shown here use the sources that were available."],
    failed: ["Report failed", "Report sources could not load. Retry before using this period."],
    "no-data": ["No data logged for this period yet", "Start logging food, workouts, progress, habits, or sleep to build this report."],
    "insufficient-data": ["Limited data coverage", "Some trends need more saved logs before Plaivra can calculate reliable averages or changes."]
  } satisfies Record<ReportHealth, [string, string]>;
  const [title, description] = content[health];
  return (
    <Card className={health === "partial" || health === "failed" ? "border-warning/30 bg-warning/10" : undefined}>
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        {health === "complete" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />}
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceCoverageGrid({ sources }: { sources: SourceCoverage[] }) {
  return (
    <Card variant="glassStrong">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" /> Data coverage this period
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sources.map((source) => (
          <div key={source.id} className="solid-row p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{source.label}</p>
              <Badge variant={badgeVariantForSource(source.state)}>{sourceLabelForState(source.state)}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{source.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyReportGuidance({ sources }: { sources: SourceCoverage[] }) {
  const needed = sources.filter((source) => source.state === "no-data" || source.state === "insufficient-data" || source.state === "failed").slice(0, 5);
  if (!needed.length) return null;
  return (
    <Card variant="glass" className="border-dashed">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="font-semibold text-foreground">Add data for a clearer report</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">These links open the logging routes that improve this read-only report. Plaivra does not create or change report data from here.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {needed.map((source) => (
            <Button key={source.id} asChild className="min-h-12" variant="outline">
              <Link href={source.actionHref}>{source.actionLabel}</Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportDetails({ report, mode }: { report: AggregatedReport; mode: Mode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card variant="glassStrong">
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Period notes</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{report.workoutsCompleted === null ? `No workouts logged ${mode === "weekly" ? "this week" : "this month"}.` : `${report.workoutsCompleted} completed and ${report.workoutsSkipped ?? 0} skipped workouts in this period.`}</p>
          <p>{report.weightChange === null ? "Measurements and weight need at least two progress entries in this period." : `Weight trend: ${formatDelta(report.weightChange)} kg.`}</p>
          <p>{report.habitCompletion === null ? "No habit completions found for this period." : `Habit completion: ${report.habitCompletion}%.`}</p>
          <p>{report.prs.length ? `${report.prs.length} PR(s) achieved in this period.` : "No PRs recorded in this period."}</p>
          <p>{report.sleepAverage === null ? "Not enough sleep logs for an average." : `Average sleep: ${report.sleepAverage}h.`}</p>
        </CardContent>
      </Card>

      <Card variant="glassStrong">
        <CardHeader><CardTitle>Measurement changes</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {report.measurementChanges.map((item) => (
            <div key={item.label} className="solid-row p-3">
              <p className="font-semibold">{item.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.value === null ? "Needs at least two entries" : `${formatDelta(item.value)} ${item.unit}`}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card variant="glassStrong" className="xl:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" /> PRs achieved in selected period</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {report.prs.map((record) => (
            <div key={record.id} className="solid-row p-3">
              <p className="font-semibold">{record.exercise_name}</p>
              <p className="text-sm text-muted-foreground">{record.record_type} | {record.record_date}</p>
              <p className="text-sm text-muted-foreground">{[record.weight_kg ? `${record.weight_kg} kg` : null, record.reps ? `${record.reps} reps` : null, record.notes].filter(Boolean).join(" | ") || "PR logged"}</p>
            </div>
          ))}
          {!report.prs.length ? <p className="text-sm text-muted-foreground">No PRs recorded in this period.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <CardGridSkeleton count={5} rows={3} />
      <div className="grid gap-4 xl:grid-cols-2">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={5} />
      </div>
    </div>
  );
}

function LoadingOverlayLabel() {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground" aria-live="polite">
      <p className="flex items-center gap-2 font-semibold"><Loader2 className="h-4 w-4 animate-spin" /> Updating report period...</p>
      <p className="mt-1 text-muted-foreground">The previous report remains visible until the next period finishes loading.</p>
    </div>
  );
}

function ExportStatusBanner({ status }: { status: ExportStatus }) {
  if (!status) return null;
  return (
    <div className={`rounded-md border p-3 text-sm ${status.type === "success" ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10"}`} aria-live="polite">
      <p className="font-semibold text-foreground">{status.type === "success" ? "Export ready" : "Export failed"}</p>
      <p className="mt-1 text-muted-foreground">{status.message}</p>
    </div>
  );
}

async function getNutritionForRange(userId: string, range: ReportRange, options?: { throwOnError?: boolean }) {
  const weekStarts = Array.from(new Set(datesInRange(range.start, range.end).map((date) => startOfWeek(date))));
  const weeks = await Promise.all(weekStarts.map((weekStart) => getNutritionWeek(userId, weekStart, options)));
  const flattened = weeks.flat().filter((day) => day.date >= range.start && day.date <= range.end);
  return dedupeNutritionDays(flattened);
}

function dedupeNutritionDays(days: DailyNutritionSummary[]) {
  const map = new Map<string, DailyNutritionSummary>();
  days.forEach((day) => map.set(day.date, day));
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function loadSource<T>(loader: () => Promise<T>, fallback: T): Promise<SourceResult<T>> {
  try {
    return { ok: true, data: await loader() };
  } catch (error) {
    return { ok: false, data: fallback, error: error instanceof Error ? error.message : "This source could not load." };
  }
}

function buildSourceCoverage({
  range,
  report,
  nutrition,
  workouts,
  progressEntries,
  habits,
  sleepLogs,
  personalRecords
}: {
  range: ReportRange;
  report: AggregatedReport;
  nutrition: SourceResult<DailyNutritionSummary[]>;
  workouts: SourceResult<WorkoutSession[]>;
  progressEntries: SourceResult<ProgressEntry[]>;
  habits: SourceResult<FitnessHabit[]>;
  sleepLogs: SourceResult<EnhancedSleepRecoveryLog[]>;
  personalRecords: SourceResult<PersonalRecord[]>;
}): SourceCoverage[] {
  const periodWorkouts = workouts.data.filter((session) => inRange(sessionDate(session), range));
  const periodProgress = progressEntries.data.filter((entry) => inRange(entry.entry_date, range));
  const periodHabits = habits.data.filter((habit) => inRange(habit.habit_date, range));
  const periodSleep = sleepLogs.data.filter((log) => inRange(log.log_date, range));
  const periodPrs = personalRecords.data.filter((record) => inRange(record.record_date, range));
  const nutritionDays = nutrition.data.filter((day) => inRange(day.date, range) && (day.logs.length > 0 || day.water_ml > 0));

  return [
    source("nutrition", "Nutrition and water", nutrition, nutritionDays.length, {
      complete: `${report.nutritionDaysLogged} food day(s) and ${nutrition.data.filter((day) => inRange(day.date, range) && day.water_ml > 0).length} water day(s) found. Averages use saved logs only.`,
      empty: "No food or water logs found for this period.",
      actionHref: "/calories",
      actionLabel: "Open Calories"
    }),
    source("workouts", "Workouts", workouts, periodWorkouts.length, {
      complete: `${periodWorkouts.length} completed/skipped workout record(s) found.`,
      empty: "No workout sessions found for this period.",
      actionHref: "/my-workout/plans",
      actionLabel: "Open My Workout"
    }),
    source("progress", "Progress", progressEntries, periodProgress.length, {
      complete: `${periodProgress.length} progress entries found.`,
      empty: "No progress entries found for this period.",
      insufficient: "Progress trends need at least two entries in this period.",
      requiredCount: 2,
      actionHref: "/progress",
      actionLabel: "Open Progress"
    }),
    source("habits", "Habits", habits, periodHabits.length, {
      complete: `${periodHabits.length} habit record(s) found.`,
      empty: "No habits found for this period.",
      actionHref: "/habits",
      actionLabel: "Open Habits"
    }),
    source("sleep", "Sleep and recovery", sleepLogs, periodSleep.length, {
      complete: `${periodSleep.length} sleep/recovery log(s) found.`,
      empty: "No sleep or recovery logs found for this period.",
      actionHref: "/sleep-recovery",
      actionLabel: "Open Sleep"
    }),
    source("prs", "Personal records", personalRecords, periodPrs.length, {
      complete: `${periodPrs.length} PR(s) recorded in this period.`,
      empty: "No PRs recorded in this period.",
      actionHref: "/personal-records",
      actionLabel: "Open PRs"
    })
  ];
}

function source<T>(
  id: SourceCoverage["id"],
  label: string,
  result: SourceResult<T[]>,
  count: number,
  copy: { complete: string; empty: string; actionHref: string; actionLabel: string; insufficient?: string; requiredCount?: number }
): SourceCoverage {
  if (!result.ok) {
    return { id, label, state: "failed", detail: result.error, actionHref: copy.actionHref, actionLabel: copy.actionLabel };
  }
  if (copy.requiredCount && count > 0 && count < copy.requiredCount) {
    return { id, label, state: "insufficient-data", detail: copy.insufficient ?? copy.empty, actionHref: copy.actionHref, actionLabel: copy.actionLabel };
  }
  if (count <= 0) {
    return { id, label, state: "no-data", detail: copy.empty, actionHref: copy.actionHref, actionLabel: copy.actionLabel };
  }
  return { id, label, state: "complete", detail: copy.complete, actionHref: copy.actionHref, actionLabel: copy.actionLabel };
}

function getReportHealth(sources: SourceCoverage[]): ReportHealth {
  if (sources.every((source) => source.state === "failed")) return "failed";
  if (sources.some((source) => source.state === "failed")) return "partial";
  const coreSources = sources.filter((source) => source.id !== "prs");
  if (coreSources.every((source) => source.state === "no-data")) return "no-data";
  if (coreSources.some((source) => source.state === "no-data" || source.state === "insufficient-data")) return "insufficient-data";
  return "complete";
}

function badgeVariantForSource(state: SourceState) {
  if (state === "complete") return "success";
  if (state === "failed") return "destructive";
  if (state === "partial" || state === "insufficient-data") return "warning";
  return "outline";
}

function sourceLabelForState(state: SourceState) {
  if (state === "complete") return "Complete";
  if (state === "failed") return "Failed";
  if (state === "partial") return "Partial";
  if (state === "insufficient-data") return "Insufficient";
  return "No data";
}

function sessionDate(session: WorkoutSession) {
  return (session.completed_at || session.skipped_at || session.started_at || "").slice(0, 10);
}

function inRange(date: string | null | undefined, range: ReportRange) {
  return Boolean(date && date >= range.start && date <= range.end);
}
