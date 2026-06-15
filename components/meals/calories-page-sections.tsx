"use client";

import Link from "next/link";
import { ChefHat, ChevronLeft, ChevronRight, Copy, Droplets, PackageSearch, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatIsoDate } from "@/lib/date-utils";
import { percent, sumFoodLogs } from "@/services/nutrition/calculations";
import type { SavedTargets } from "@/services/nutrition/targets";
import type { DailyNutritionSummary, WaterLog } from "@/types";

function mixColor(start: [number, number, number], end: [number, number, number], amount: number) {
  const clamped = Math.min(1, Math.max(0, amount));
  const [r, g, b] = start.map((value, index) => Math.round(value + (end[index] - value) * clamped));
  return `rgb(${r}, ${g}, ${b})`;
}

function calorieProgressColor(progressPercent: number) {
  if (progressPercent <= 50) return "#2D3A1E";
  if (progressPercent <= 80) return mixColor([45, 58, 30], [196, 154, 59], (progressPercent - 50) / 30);
  if (progressPercent <= 95) return mixColor([196, 154, 59], [184, 92, 0], (progressPercent - 80) / 15);
  return "#9E2B2B";
}

export function formatDay(value: string) {
  return formatIsoDate(value, { weekday: "short", month: "short", day: "numeric" });
}

export function TargetField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

export function TrackerCard({ label, value, target, unit, hasTarget }: { label: string; value: number; target: number; unit: string; hasTarget: boolean }) {
  const progressValue = percent(value, target);
  const isCalories = label.toLowerCase() === "calories";
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold">{value}{unit}</p>
        <p className="mt-1 text-sm text-muted-foreground">{hasTarget ? `Target ${target}${unit}` : "No target set"}</p>
        <Progress value={hasTarget ? progressValue : 0} className="mt-4" indicatorStyle={isCalories ? { background: calorieProgressColor(progressValue) } : undefined} />
      </CardContent>
    </Card>
  );
}

export function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {values.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
      </select>
    </div>
  );
}

export function SavedTarget({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3"><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

export function WeeklyTracker({ selectedDate, weekData, onSelectDate, onMoveWeek }: { selectedDate: string; weekData: DailyNutritionSummary[]; onSelectDate: (date: string) => void; onMoveWeek: (days: number) => void }) {
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>Weekly tracker</CardTitle>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onMoveWeek(-7)}><ChevronLeft className="h-4 w-4" /> Previous</Button><Button variant="outline" size="sm" onClick={() => onMoveWeek(7)}>Next <ChevronRight className="h-4 w-4" /></Button></div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {weekData.map((day) => (
            <button key={day.date} type="button" onClick={() => onSelectDate(day.date)} className={`rounded-md border p-3 text-left transition-colors hover:border-primary/45 hover:bg-muted/40 ${day.date === selectedDate ? "border-primary bg-primary/10" : "bg-card"}`}>
              <p className="font-semibold">{formatDay(day.date)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{day.has_targets ? `${day.calories} / ${day.planned_calories} kcal` : `${day.calories} kcal logged`}</p>
              <p className="mt-1 text-xs text-muted-foreground">P {day.protein_g}g | C {day.carbs_g}g | F {day.fat_g}g</p>
              <p className="mt-1 text-xs text-muted-foreground">Water {day.water_ml} ml</p>
              <Progress value={day.has_targets ? percent(day.calories, day.planned_calories) : 0} className="mt-3" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FastFoodFlowCard({ selectedDateLabel, hasFoodLogs, hasTargets, onCopyYesterday }: { selectedDateLabel: string; hasFoodLogs: boolean; hasTargets: boolean; onCopyYesterday: () => void }) {
  const steps = [
    { icon: PackageSearch, label: "Packaged food", detail: "Scan or type a barcode with Open Food Facts.", href: "#barcode-tools" },
    { icon: Copy, label: "Repeat routine", detail: hasFoodLogs ? `Use recent ${selectedDateLabel} logs as reference.` : "Copy from the day before when similar.", onClick: onCopyYesterday },
    { icon: ChefHat, label: "Custom meal", detail: "Save meals you eat often instead of rebuilding them.", href: "/calories/custom-food-meal" },
    { icon: Star, label: "Targets", detail: hasTargets ? "Targets are active for remaining macros." : "Set targets to unlock remaining macros.", href: "#daily-targets" }
  ];
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Fast food logging</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => {
          const Icon = step.icon;
          const content = <><span className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" />{step.label}</span><span className="mt-1 block text-sm text-muted-foreground">{step.detail}</span></>;
          return step.href ? <Link key={step.label} href={step.href} className="rounded-md border bg-muted/40 p-3 transition hover:border-primary">{content}</Link> : <button key={step.label} type="button" onClick={step.onClick} className="rounded-md border bg-muted/40 p-3 text-left transition hover:border-primary">{content}</button>;
        })}
      </CardContent>
    </Card>
  );
}

export function NutritionCoachCard({ weekData, targets, totals, waterTotal }: { weekData: DailyNutritionSummary[]; targets: SavedTargets; totals: ReturnType<typeof sumFoodLogs>; waterTotal: number }) {
  const insights = buildNutritionInsights({ weekData, targets, totals, waterTotal });
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Nutrition coaching</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight) => <div key={insight.label} className="rounded-md border bg-muted/35 p-3"><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{insight.label}</p><p className="mt-1 font-semibold text-foreground">{insight.value}</p><p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p></div>)}
      </CardContent>
    </Card>
  );
}

function buildNutritionInsights({ weekData, targets, totals, waterTotal }: { weekData: DailyNutritionSummary[]; targets: SavedTargets; totals: ReturnType<typeof sumFoodLogs>; waterTotal: number }) {
  const loggedDays = weekData.filter((day) => day.logs.length > 0);
  const averageCalories = loggedDays.length ? Math.round(loggedDays.reduce((sum, day) => sum + day.calories, 0) / loggedDays.length) : 0;
  const averageProtein = loggedDays.length ? Math.round(loggedDays.reduce((sum, day) => sum + day.protein_g, 0) / loggedDays.length) : 0;
  const caloriesRemaining = targets.daily_calories - totals.calories;
  const proteinRemaining = targets.protein_g - totals.protein_g;
  const waterRemaining = targets.water_ml - waterTotal;
  const bestDay = loggedDays.slice().sort((a, b) => Math.abs(a.calories - a.planned_calories) - Math.abs(b.calories - b.planned_calories))[0];
  return [
    { label: "Today", value: caloriesRemaining >= 0 ? `${caloriesRemaining} kcal left` : `${Math.abs(caloriesRemaining)} kcal over`, detail: targets.daily_calories ? "Use this to adjust the next meal instead of guessing." : "Set calorie targets to unlock daily guidance." },
    { label: "Protein", value: proteinRemaining > 0 ? `${proteinRemaining}g left` : "Target hit", detail: proteinRemaining > 0 ? "Prioritize lean protein in the next meal." : "Keep the remaining meals balanced." },
    { label: "Weekly average", value: loggedDays.length ? `${averageCalories} kcal / ${averageProtein}g protein` : "No logged days", detail: `${loggedDays.length}/7 days have food logs this week.` },
    { label: "Next action", value: waterRemaining > 0 ? `Drink ${waterRemaining} ml` : bestDay ? `Repeat ${formatDay(bestDay.date)}` : "Log first meal", detail: waterRemaining > 0 ? "Water is the simplest habit to close today." : "Repeat the day closest to your target." }
  ];
}

export function WeeklyOverview({ weekData, waterGoalMl }: { weekData: DailyNutritionSummary[]; waterGoalMl: number }) {
  const planned = weekData.reduce((sum, day) => sum + day.planned_calories, 0);
  const actual = weekData.reduce((sum, day) => sum + day.calories, 0);
  const protein = weekData.reduce((sum, day) => sum + day.protein_g, 0);
  const carbs = weekData.reduce((sum, day) => sum + day.carbs_g, 0);
  const fat = weekData.reduce((sum, day) => sum + day.fat_g, 0);
  const water = weekData.reduce((sum, day) => sum + day.water_ml, 0);
  const difference = actual - planned;
  const deviation = planned ? (difference / planned) * 100 : 0;
  const loggedDays = weekData.filter((day) => day.logs.length > 0);
  const best = loggedDays.slice().sort((a, b) => Math.abs(a.calories - a.planned_calories) - Math.abs(b.calories - b.planned_calories))[0];
  const worst = loggedDays.slice().sort((a, b) => Math.abs(b.calories - b.planned_calories) - Math.abs(a.calories - a.planned_calories))[0];
  const status = Math.abs(deviation) <= 5 ? "On track" : deviation < -15 ? "Large deficit" : deviation < -5 ? "Slight deficit" : deviation > 15 ? "Large surplus" : "Slight surplus";
  const maxCalories = Math.max(1, ...weekData.map((day) => Math.max(day.planned_calories, day.calories)));
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Weekly Summary</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <OverviewMetric label="Planned calories" value={planned} /><OverviewMetric label="Actual calories" value={actual} /><OverviewMetric label="Difference" value={`${difference > 0 ? "+" : ""}${difference} kcal`} /><OverviewMetric label="Deviation" value={`${Math.round(deviation * 10) / 10}%`} detail={status} />
          <OverviewMetric label="Average calories" value={Math.round(actual / 7)} /><OverviewMetric label="Average protein" value={`${Math.round(protein / 7)}g`} /><OverviewMetric label="Average carbs" value={`${Math.round(carbs / 7)}g`} /><OverviewMetric label="Average fat" value={`${Math.round(fat / 7)}g`} />
          <OverviewMetric label="Best tracking day" value={best ? formatDay(best.date) : "None"} /><OverviewMetric label="Worst deviation day" value={worst ? formatDay(worst.date) : "None"} /><OverviewMetric label="Days logged" value={`${loggedDays.length}/7`} /><OverviewMetric label="Water" value={`${Math.round(water / 100) / 10} L`} detail={`${Math.round(water / 7)} ml avg`} />
        </div>
        <div><div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">Weekly progress</span><span className="text-muted-foreground">{actual} / {planned} kcal</span></div><Progress value={percent(actual, planned)} /></div>
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-md border p-3">
            <p className="text-sm font-semibold">Daily comparison</p>
            <div className="mt-3 space-y-2">
              {weekData.map((day) => <div key={day.date} className="grid grid-cols-[76px_1fr] items-center gap-3 text-xs"><span>{formatDay(day.date).split(",")[0]}</span><div className="space-y-1"><div className="h-2 rounded bg-primary/30"><div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, (day.planned_calories / maxCalories) * 100)}%` }} /></div><div className="h-2 rounded bg-success/15"><div className="h-2 rounded bg-success" style={{ width: `${Math.min(100, (day.calories / maxCalories) * 100)}%` }} /></div></div></div>)}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm font-semibold">Macro distribution</p>
            <div className="mt-3 space-y-3"><MacroBar label="Protein" value={protein} total={protein + carbs + fat} /><MacroBar label="Carbs" value={carbs} total={protein + carbs + fat} /><MacroBar label="Fat" value={fat} total={protein + carbs + fat} /><div className="pt-2"><div className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-1"><Droplets className="h-4 w-4" /> Water</span><span>{Math.round(water / 100) / 10} L</span></div><Progress value={percent(water, waterGoalMl * 7)} /></div></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewMetric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="rounded-md bg-muted/35 p-3"><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold text-foreground">{value}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div>;
}

function MacroBar({ label, value, total }: { label: string; value: number; total: number }) {
  return <div><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{Math.round(value)}g</span></div><Progress value={percent(value, total)} /></div>;
}

export function WaterCard({ waterTotal, waterGoal, customWaterMl, setCustomWaterMl, waterLogs, onAddWater, onRemoveWater }: { waterTotal: number; waterGoal: number; customWaterMl: string; setCustomWaterMl: (value: string) => void; waterLogs: WaterLog[]; onAddWater: (amount: number) => void; onRemoveWater: (log: WaterLog) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Water intake</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><p className="text-2xl font-bold">{waterTotal} ml</p><p className="text-sm text-muted-foreground">Goal {waterGoal} ml</p><Progress value={percent(waterTotal, waterGoal)} className="mt-3" /></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[250, 500, 750, 1000].map((amount) => <Button key={amount} type="button" variant="outline" size="sm" onClick={() => onAddWater(amount)}>+{amount === 1000 ? "1 L" : `${amount} ml`}</Button>)}</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input type="number" min="1" value={customWaterMl} onChange={(event) => setCustomWaterMl(event.target.value)} /><Button type="button" onClick={() => onAddWater(Number(customWaterMl))}>Add water</Button></div>
        <div className="space-y-2">{waterLogs.map((log) => <div key={log.id} className="flex items-center justify-between rounded-md border p-2 text-sm"><span>{log.amount_ml} ml</span><Button type="button" variant="ghost" size="icon" onClick={() => onRemoveWater(log)} aria-label="Delete water log"><Trash2 className="h-4 w-4" /></Button></div>)}</div>
      </CardContent>
    </Card>
  );
}
