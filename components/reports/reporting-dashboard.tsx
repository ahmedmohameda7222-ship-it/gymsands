"use client";

import { useTodayDate } from "@/lib/hooks/use-today-date";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getNutritionWeek } from "@/services/database/nutrition";
import { getPersonalRecords, getProgressEntries } from "@/services/database/progress";
import { getWorkoutActivity } from "@/services/database/workout-sessions";
import { getFitnessHabitHistory, getSleepRecoveryHistory } from "@/services/wellness/wellness-data";
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
import type { DailyNutritionSummary } from "@/types";

type Mode = "weekly" | "monthly";

export function ReportingDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [mode, setMode] = useState<Mode>("weekly");
  const [selectedDate, setSelectedDate] = useState(today);
  const [report, setReport] = useState<AggregatedReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const range = useMemo(() => mode === "weekly" ? buildWeekRange(selectedDate) : buildMonthRange(selectedDate), [mode, selectedDate]);
  const metrics = report ? reportMetrics(report, mode) : [];

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const [nutrition, workouts, progressEntries, habits, sleepLogs, personalRecords] = await Promise.all([
          getNutritionForRange(user.id, range),
          getWorkoutActivity(user.id, 500),
          getProgressEntries(user.id),
          getFitnessHabitHistory(user.id, 450),
          getSleepRecoveryHistory(user.id, 450),
          getPersonalRecords(user.id, 500)
        ]);
        if (!active) return;
        setReport(aggregateReport({ range, nutrition, workouts, progressEntries, habits, sleepLogs, personalRecords }));
      } catch (error) {
        if (!active) return;
        setReport(null);
        toast({ title: "Could not load report", description: error instanceof Error ? error.message : "Please try again." });
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [range, toast, user?.id]);

  function movePeriod(delta: number) {
    if (mode === "weekly") setSelectedDate(addDays(selectedDate, delta * 7));
    else {
      const date = new Date(`${selectedDate}T00:00:00`);
      date.setMonth(date.getMonth() + delta);
      setSelectedDate(date.toISOString().slice(0, 10));
    }
  }

  function exportCsv() {
    if (!report) return;
    downloadCsv(`plaivra-${mode}-report-${report.range.start}-to-${report.range.end}.csv`, reportToCsv(report));
  }

  return (
    <div className="space-y-5">
      <Card variant="glass">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{mode === "weekly" ? "Weekly report" : "Monthly report"}</Badge>
              <Badge variant="outline">{range.label}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "weekly" ? "default" : "outline"} onClick={() => setMode("weekly")}>Weekly</Button>
            <Button variant={mode === "monthly" ? "default" : "outline"} onClick={() => setMode("monthly")}>Monthly</Button>
            <Button variant="outline" onClick={() => movePeriod(-1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
            <Button variant="outline" onClick={() => setSelectedDate(today)}>Current</Button>
            <Button variant="outline" onClick={() => movePeriod(1)}>Next <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading report...</p> : null}
      {!isLoading && !report ? <p className="rounded-md border p-3 text-sm text-muted-foreground">Could not build a report for this period.</p> : null}

      {report ? (
        <>
          <div className="solid-tracking-card flex flex-wrap justify-end gap-2 p-3">
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          </div>
          <MetricGrid metrics={metrics} />
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

function ReportDetails({ report, mode }: { report: AggregatedReport; mode: Mode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card variant="glassStrong">
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Empty states / period checks</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{report.workoutsCompleted === null ? `No workouts logged ${mode === "weekly" ? "this week" : "this month"}.` : `${report.workoutsCompleted} completed and ${report.workoutsSkipped ?? 0} skipped workouts in this period.`}</p>
          <p>{report.weightChange === null ? "Not enough weight entries for a trend." : `Weight trend: ${formatDelta(report.weightChange)} kg.`}</p>
          <p>{report.habitCompletion === null ? "No habit completions found for this period." : `Habit completion: ${report.habitCompletion}%.`}</p>
          <p>{report.prs.length ? `${report.prs.length} PR(s) achieved in this period.` : "No PRs achieved in this period."}</p>
          <p>{report.sleepAverage === null ? "Not enough sleep logs for an average." : `Average sleep: ${report.sleepAverage}h.`}</p>
        </CardContent>
      </Card>

      <Card variant="glassStrong">
        <CardHeader><CardTitle>Measurement changes</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {report.measurementChanges.map((item) => (
            <div key={item.label} className="solid-row p-3">
              <p className="font-semibold">{item.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.value === null ? "Not enough data" : `${formatDelta(item.value)} ${item.unit}`}</p>
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
          {!report.prs.length ? <p className="text-sm text-muted-foreground">No PRs achieved in this period.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

async function getNutritionForRange(userId: string, range: ReportRange) {
  const weekStarts = Array.from(new Set(datesInRange(range.start, range.end).map((date) => startOfWeek(date))));
  const weeks = await Promise.all(weekStarts.map((weekStart) => getNutritionWeek(userId, weekStart)));
  const flattened = weeks.flat().filter((day) => day.date >= range.start && day.date <= range.end);
  return dedupeNutritionDays(flattened);
}

function dedupeNutritionDays(days: DailyNutritionSummary[]) {
  const map = new Map<string, DailyNutritionSummary>();
  days.forEach((day) => map.set(day.date, day));
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
