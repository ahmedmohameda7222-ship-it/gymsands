"use client";

import Link from "next/link";
import { BarChart3, Plus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { applyWeekTargets, buildWeekAnalytics, type EatWeekTargetDay, type SourceState } from "@/lib/eat/eat-model";
import { formatEatEnergy } from "@/lib/eat/eat-units";
import { useEatTranslation } from "@/lib/i18n/eat";
import type { UserAppSettings } from "@/services/database/user-settings";
import type { DailyNutritionSummary } from "@/types";

export function EatWeekView({
  week,
  weekTargets,
  selectedDate,
  energyUnit,
  onSelectDate,
  onAddFood,
  onRetryLogs,
  onRetryTargets
}: {
  week: SourceState<DailyNutritionSummary[]>;
  weekTargets: SourceState<EatWeekTargetDay[]>;
  selectedDate: string;
  energyUnit: UserAppSettings["energyUnit"];
  onSelectDate: (date: string) => void;
  onAddFood: () => void;
  onRetryLogs: () => void;
  onRetryTargets: () => void;
}) {
  const { et, formatDate, locale } = useEatTranslation();
  if (week.status === "loading" && !week.data) return <Card><CardContent className="p-6 text-sm text-muted-foreground">{et("loading")}</CardContent></Card>;
  if (week.status === "failed" && !week.data) return <Card><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-destructive">{et("weekFailed")}</p><Button variant="outline" onClick={onRetryLogs}><RefreshCcw className="h-4 w-4" />{et("retry")}</Button></CardContent></Card>;

  const days = applyWeekTargets(week.data ?? [], weekTargets.data ?? []);
  const analytics = buildWeekAnalytics(days);
  const maxCalories = Math.max(1, ...days.map((day) => day.calories));
  const maxProtein = Math.max(1, ...days.map((day) => day.protein_g));
  const adherenceValue = weekTargets.status === "failed"
    ? et("adherenceUnavailableTargets")
    : weekTargets.status === "loading" && !weekTargets.data
      ? et("loading")
      : analytics.adherenceDays === null
        ? et("adherenceNotConfigured")
        : et("adherenceMatched", { near: analytics.adherenceDays, eligible: analytics.targetEligibleLoggedDays });

  return <div className="space-y-4">
    <Card>
      <CardHeader className="space-y-0 pb-3"><CardTitle>{et("week")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{formatDate(days[0]?.date ?? selectedDate, { day: "numeric", month: "short" })} – {formatDate(days[6]?.date ?? selectedDate, { day: "numeric", month: "short", year: "numeric" })}</p></CardHeader>
      <CardContent><div className="grid grid-cols-7 gap-1.5">{days.map((day) => <button key={day.date} type="button" onClick={() => onSelectDate(day.date)} className={`min-h-16 rounded-[12px] border p-2 text-center text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${day.date === selectedDate ? "border-primary bg-primary/10" : "border-border/70 bg-card hover:border-primary/40"}`}><span className="block font-semibold">{formatDate(day.date, { weekday: "short" })}</span><span className="mt-1 block text-muted-foreground">{formatDate(day.date, { day: "numeric" })}</span>{day.logs.length ? <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-label={et("loggedIndicator")} /> : null}</button>)}</div></CardContent>
    </Card>

    {analytics.coverageLabel === "empty" ? <Card className="border-dashed"><CardContent className="flex flex-col items-start gap-3 p-6"><BarChart3 className="h-6 w-6 text-primary" /><div><p className="font-semibold">{et("noWeekData")}</p><p className="mt-1 text-sm text-muted-foreground">{et("noWeekDataDesc")}</p></div><Button type="button" className="min-h-12" onClick={onAddFood}><Plus className="h-4 w-4" />{et("addFood")}</Button></CardContent></Card> : <>
      <Card><CardContent className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold">{et("weekCoverage")}</p><div className="text-sm"><span className="font-bold">{et("daysLogged", { count: analytics.loggedDays })}</span>{analytics.coverageLabel === "partial" ? <span className="ms-2 text-muted-foreground">· {et("averagesLogged")}</span> : null}</div></CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendCard title={et("caloriesTrend")} days={days} max={maxCalories} value={(day) => day.calories} format={(value) => formatEatEnergy(value, energyUnit, locale)} />
        <TrendCard title={et("proteinTrend")} days={days} max={maxProtein} value={(day) => day.protein_g} format={(value) => `${Math.round(value * 10) / 10} g`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={et("avgCalories")} value={analytics.averageCaloriesLoggedDays === null ? "—" : formatEatEnergy(analytics.averageCaloriesLoggedDays, energyUnit, locale)} />
        <Metric label={et("avgProtein")} value={analytics.averageProteinLoggedDays === null ? "—" : `${analytics.averageProteinLoggedDays} g`} />
        <Metric label={et("calendarAverage")} value={analytics.calendarAverageCalories === null ? "—" : formatEatEnergy(analytics.calendarAverageCalories, energyUnit, locale)} />
        <Metric label={et("adherence")} value={adherenceValue} />
      </div>
      {weekTargets.status === "failed" ? <Card className="border-warning/30 bg-warning/5"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{et("adherenceUnavailableTargets")}</p><Button type="button" variant="outline" onClick={onRetryTargets}><RefreshCcw className="h-4 w-4" />{et("retry")}</Button></CardContent></Card> : analytics.targetsState === "partial" ? <p className="text-sm text-muted-foreground">{et("targetCoveragePartial")}</p> : null}
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">{et("macroContributionLogged")}</CardTitle></CardHeader><CardContent className="space-y-2"><MacroLine label={et("protein")} value={analytics.proteinCalories} total={analytics.macroCaloriesTotal} display={formatEatEnergy(analytics.proteinCalories, energyUnit, locale)} /><MacroLine label={et("carbs")} value={analytics.carbCalories} total={analytics.macroCaloriesTotal} display={formatEatEnergy(analytics.carbCalories, energyUnit, locale)} /><MacroLine label={et("fat")} value={analytics.fatCalories} total={analytics.macroCaloriesTotal} display={formatEatEnergy(analytics.fatCalories, energyUnit, locale)} /></CardContent></Card>
    </>}

    <Button asChild variant="outline" className="min-h-12 w-full"><Link href="/progress"><BarChart3 className="h-4 w-4" />{et("openReports")}</Link></Button>
  </div>;
}

function TrendCard({ title, days, max, value, format }: { title: string; days: DailyNutritionSummary[]; max: number; value: (day: DailyNutritionSummary) => number; format: (value: number) => string }) {
  const { formatDate } = useEatTranslation();
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-2">{days.map((day) => { const amount = value(day); return <div key={day.date} className="grid grid-cols-[52px_1fr_minmax(72px,auto)] items-center gap-2 text-xs"><span>{formatDate(day.date, { weekday: "short" })}</span><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, amount / max * 100)}%` }} /></div><span className="text-end tabular-nums">{day.logs.length ? format(amount) : "—"}</span></div>; })}</CardContent></Card>;
}
function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-bold leading-5">{value}</p></CardContent></Card>; }
function MacroLine({ label, value, total, display }: { label: string; value: number; total: number; display: string }) { const percent = total ? Math.round(value / total * 100) : 0; return <div><div className="flex justify-between gap-3 text-sm"><span>{label}</span><span>{display} · {percent}%</span></div><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} /></div></div>; }
