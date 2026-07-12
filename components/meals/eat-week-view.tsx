"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildWeekAnalytics, type SourceState } from "@/lib/eat/eat-model";
import { useEatTranslation } from "@/lib/i18n/eat";
import type { DailyNutritionSummary } from "@/types";

export function EatWeekView({
  week,
  selectedDate,
  targetCalories,
  onMoveWeek,
  onSelectDate,
  onAddFood,
  onRetry
}: {
  week: SourceState<DailyNutritionSummary[]>;
  selectedDate: string;
  targetCalories: number | null;
  onMoveWeek: (days: number) => void;
  onSelectDate: (date: string) => void;
  onAddFood: () => void;
  onRetry: () => void;
}) {
  const { et, formatDate } = useEatTranslation();
  if (week.status === "loading") return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>;
  if (week.status === "failed") return <Card><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-destructive">{et("weekFailed")}</p><Button variant="outline" onClick={onRetry}>{et("retry")}</Button></CardContent></Card>;
  const analytics = buildWeekAnalytics(week.data, targetCalories);
  const maxCalories = Math.max(1, ...week.data.map((day) => day.calories));
  const maxProtein = Math.max(1, ...week.data.map((day) => day.protein_g));

  return <div className="space-y-4">
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div><CardTitle>{et("week")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{formatDate(week.data[0]?.date ?? selectedDate, { day: "numeric", month: "short" })} – {formatDate(week.data[6]?.date ?? selectedDate, { day: "numeric", month: "short", year: "numeric" })}</p></div>
        <div className="flex gap-2"><Button type="button" variant="outline" size="icon" className="min-h-11 min-w-11" onClick={() => onMoveWeek(-7)} aria-label="Previous week"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button><Button type="button" variant="outline" size="icon" className="min-h-11 min-w-11" onClick={() => onMoveWeek(7)} aria-label="Next week"><ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button></div>
      </CardHeader>
      <CardContent><div className="grid grid-cols-7 gap-1.5">{week.data.map((day) => <button key={day.date} type="button" onClick={() => onSelectDate(day.date)} className={`min-h-16 rounded-[12px] border p-2 text-center text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${day.date === selectedDate ? "border-primary bg-primary/10" : "border-border/70 bg-card hover:border-primary/40"}`}><span className="block font-semibold">{formatDate(day.date, { weekday: "short" })}</span><span className="mt-1 block text-muted-foreground">{formatDate(day.date, { day: "numeric" })}</span>{day.logs.length ? <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-label="Logged" /> : null}</button>)}</div></CardContent>
    </Card>

    {analytics.coverageLabel === "empty" ? <Card className="border-dashed"><CardContent className="flex flex-col items-start gap-3 p-6"><BarChart3 className="h-6 w-6 text-primary" /><div><p className="font-semibold">{et("noWeekData")}</p><p className="mt-1 text-sm text-muted-foreground">{et("noWeekDataDesc")}</p></div><Button type="button" className="min-h-12" onClick={onAddFood}><Plus className="h-4 w-4" />{et("addFood")}</Button></CardContent></Card> : <>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">{et("weekCoverage")}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{et("daysLogged", { count: analytics.loggedDays })}</p>{analytics.coverageLabel === "partial" ? <p className="mt-1 text-sm text-muted-foreground">{et("averagesLogged")}</p> : null}</CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendCard title={et("caloriesTrend")} days={week.data} max={maxCalories} value={(day) => day.calories} unit="kcal" />
        <TrendCard title={et("proteinTrend")} days={week.data} max={maxProtein} value={(day) => day.protein_g} unit="g" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={et("avgCalories")} value={analytics.averageCaloriesLoggedDays === null ? "—" : `${analytics.averageCaloriesLoggedDays} kcal`} />
        <Metric label={et("avgProtein")} value={analytics.averageProteinLoggedDays === null ? "—" : `${analytics.averageProteinLoggedDays} g`} />
        <Metric label="Seven-day calendar average" value={analytics.calendarAverageCalories === null ? "—" : `${analytics.calendarAverageCalories} kcal`} />
        <Metric label={et("adherence")} value={analytics.adherenceDays === null ? "Target unavailable" : `${analytics.adherenceDays} days near target`} />
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Macro calorie contribution</CardTitle></CardHeader><CardContent className="space-y-2"><MacroLine label={et("protein")} value={analytics.proteinCalories} total={analytics.macroCaloriesTotal} /><MacroLine label={et("carbs")} value={analytics.carbCalories} total={analytics.macroCaloriesTotal} /><MacroLine label={et("fat")} value={analytics.fatCalories} total={analytics.macroCaloriesTotal} /></CardContent></Card>
    </>}

    <Button asChild variant="outline" className="min-h-12 w-full"><Link href="/progress"><BarChart3 className="h-4 w-4" />{et("openReports")}</Link></Button>
  </div>;
}

function TrendCard({ title, days, max, value, unit }: { title: string; days: DailyNutritionSummary[]; max: number; value: (day: DailyNutritionSummary) => number; unit: string }) {
  const { formatDate } = useEatTranslation();
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-2">{days.map((day) => { const amount = value(day); return <div key={day.date} className="grid grid-cols-[52px_1fr_72px] items-center gap-2 text-xs"><span>{formatDate(day.date, { weekday: "short" })}</span><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, amount / max * 100)}%` }} /></div><span className="text-end tabular-nums">{day.logs.length ? `${Math.round(amount * 10) / 10} ${unit}` : "—"}</span></div>; })}</CardContent></Card>;
}
function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></CardContent></Card>; }
function MacroLine({ label, value, total }: { label: string; value: number; total: number }) { const percent = total ? Math.round(value / total * 100) : 0; return <div><div className="flex justify-between text-sm"><span>{label}</span><span>{value} kcal · {percent}%</span></div><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} /></div></div>; }
