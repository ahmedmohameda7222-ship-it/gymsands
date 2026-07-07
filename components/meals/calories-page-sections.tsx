"use client";

import Link from "next/link";
import { useId } from "react";
import { ChefHat, ChevronLeft, ChevronRight, Copy, Droplets, PackageSearch, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatIsoDate } from "@/lib/date-utils";
import { AnimatedNumber, InlineFeedback } from "@/components/motion";
import { percent, sumFoodLogs } from "@/services/nutrition/calculations";
import type { SavedTargets } from "@/services/nutrition/targets";
import type { DailyNutritionSummary, WaterLog } from "@/types";

function calorieProgressColor(progressPercent: number) {
  if (progressPercent <= 50) return "var(--color-primary)";
  if (progressPercent <= 95) return "var(--color-warning)";
  return "var(--color-destructive)";
}

export function formatDay(value: string) {
  return formatIsoDate(value, { weekday: "short", month: "short", day: "numeric" });
}

export function TargetField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type="number" min="0" inputMode="decimal" enterKeyHint="done" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

export function TrackerCard({ label, value, target, unit, hasTarget }: { label: string; value: number; target: number; unit: string; hasTarget: boolean }) {
  const progressValue = percent(value, target);
  const isCalories = label.toLowerCase() === "calories";
  return (
    <Card variant="glass">
      <CardContent className="pt-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-[28px] font-extrabold leading-none tracking-[-0.055em]"><AnimatedNumber value={value} suffix={unit} /></p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{hasTarget ? `Target ${target}${unit}` : "No target set"}</p>
        <Progress value={hasTarget ? progressValue : 0} className="mt-4" indicatorStyle={isCalories ? { background: calorieProgressColor(progressValue) } : undefined} />
      </CardContent>
    </Card>
  );
}

export function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="flex h-12 w-full rounded-[14px] border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {values.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
      </select>
    </div>
  );
}

export function SavedTarget({ label, value }: { label: string; value: string }) {
  return <div className="solid-row p-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

export function WeeklyTracker({ selectedDate, weekData, onSelectDate, onMoveWeek }: { selectedDate: string; weekData: DailyNutritionSummary[]; onSelectDate: (date: string) => void; onMoveWeek: (days: number) => void }) {
  return (
    <Card variant="glassStrong" className="mt-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>Weekly tracker</CardTitle>
        <div className="flex gap-2"><Button variant="outline" className="min-h-12" onClick={() => onMoveWeek(-7)}><ChevronLeft className="h-4 w-4" /> Previous</Button><Button variant="outline" className="min-h-12" onClick={() => onMoveWeek(7)}>Next <ChevronRight className="h-4 w-4" /></Button></div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {weekData.map((day) => (
            <button key={day.date} type="button" onClick={() => onSelectDate(day.date)} className={`min-h-12 rounded-2xl border p-3 text-left transition-colors hover:border-primary/45 hover:bg-white/45 ${day.date === selectedDate ? "border-primary bg-primary/10" : "border-white/50 bg-white/35 dark:border-white/10 dark:bg-white/5"}`}>
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
    <Card variant="glass" className="mt-4">
      <CardHeader><CardTitle>Fast food logging</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => {
          const Icon = step.icon;
          const content = <><span className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" />{step.label}</span><span className="mt-1 block text-sm text-muted-foreground">{step.detail}</span></>;
          return step.href ? <Link key={step.label} href={step.href} className="glass-chip p-3 transition hover:border-primary">{content}</Link> : <button key={step.label} type="button" onClick={step.onClick} className="glass-chip p-3 text-left transition hover:border-primary">{content}</button>;
        })}
      </CardContent>
    </Card>
  );
}

export function NutritionCoachCard({ weekData, targets, totals, waterTotal }: { weekData: DailyNutritionSummary[]; targets: SavedTargets; totals: ReturnType<typeof sumFoodLogs>; waterTotal: number }) {
  const insights = buildNutritionInsights({ weekData, targets, totals, waterTotal });
  return (
    <Card variant="glass" className="mt-4">
      <CardHeader><CardTitle>Nutrition summary</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight) => <div key={insight.label} className="solid-row p-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{insight.label}</p><p className="mt-1 font-semibold text-foreground">{insight.value}</p><p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p></div>)}
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
    <Card variant="glassStrong" className="mt-4">
      <CardHeader><CardTitle>Weekly Summary</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <OverviewMetric label="Planned calories" value={planned} /><OverviewMetric label="Actual calories" value={actual} /><OverviewMetric label="Difference" value={`${difference > 0 ? "+" : ""}${difference} kcal`} /><OverviewMetric label="Deviation" value={`${Math.round(deviation * 10) / 10}%`} detail={status} />
          <OverviewMetric label="Average calories" value={Math.round(actual / 7)} /><OverviewMetric label="Average protein" value={`${Math.round(protein / 7)}g`} /><OverviewMetric label="Average carbs" value={`${Math.round(carbs / 7)}g`} /><OverviewMetric label="Average fat" value={`${Math.round(fat / 7)}g`} />
          <OverviewMetric label="Best tracking day" value={best ? formatDay(best.date) : "None"} /><OverviewMetric label="Worst deviation day" value={worst ? formatDay(worst.date) : "None"} /><OverviewMetric label="Days logged" value={`${loggedDays.length}/7`} /><OverviewMetric label="Water" value={`${Math.round(water / 100) / 10} L`} detail={`${Math.round(water / 7)} ml avg`} />
        </div>
        <div><div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">Weekly progress</span><span className="text-muted-foreground">{actual} / {planned} kcal</span></div><Progress value={percent(actual, planned)} /></div>
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="solid-tracking-card p-3">
            <p className="text-sm font-semibold">Daily comparison</p>
            <div className="mt-3 space-y-2">
              {weekData.map((day) => <div key={day.date} className="grid grid-cols-[76px_1fr] items-center gap-3 text-xs"><span>{formatDay(day.date).split(",")[0]}</span><div className="space-y-1"><div className="h-2 rounded bg-primary/30"><div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, (day.planned_calories / maxCalories) * 100)}%` }} /></div><div className="h-2 rounded bg-success/15"><div className="h-2 rounded bg-success" style={{ width: `${Math.min(100, (day.calories / maxCalories) * 100)}%` }} /></div></div></div>)}
            </div>
          </div>
          <div className="solid-tracking-card p-3">
            <p className="text-sm font-semibold">Macro distribution</p>
            <div className="mt-3 space-y-3"><MacroBar label="Protein" value={protein} total={protein + carbs + fat} /><MacroBar label="Carbs" value={carbs} total={protein + carbs + fat} /><MacroBar label="Fat" value={fat} total={protein + carbs + fat} /><div className="pt-2"><div className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-1"><Droplets className="h-4 w-4" /> Water</span><span>{Math.round(water / 100) / 10} L</span></div><Progress value={percent(water, waterGoalMl * 7)} /></div></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewMetric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="solid-row p-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold text-foreground">{value}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div>;
}

function MacroBar({ label, value, total }: { label: string; value: number; total: number }) {
  return <div><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{Math.round(value)}g</span></div><Progress value={percent(value, total)} /></div>;
}

export function WaterCard({
  waterTotal,
  waterGoal,
  customWaterMl,
  setCustomWaterMl,
  waterLogs,
  onAddWater,
  onRemoveWater,
  waterFeedback,
  waterFeedbackVariant = "info",
  pendingWaterKey,
  deletingWaterIds
}: {
  waterTotal: number;
  waterGoal: number;
  customWaterMl: string;
  setCustomWaterMl: (value: string) => void;
  waterLogs: WaterLog[];
  onAddWater: (amount: number) => void;
  onRemoveWater: (log: WaterLog) => void;
  waterFeedback?: string;
  waterFeedbackVariant?: "info" | "error";
  pendingWaterKey?: string | null;
  deletingWaterIds?: Set<string>;
}) {
  const customAmount = Number(customWaterMl);
  const customPending = pendingWaterKey === `add-${Math.round(customAmount)}`;
  const targetHit = waterGoal > 0 && waterTotal >= waterGoal;
  return (
    <Card variant="glass">
      <CardHeader><CardTitle>Water intake</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <InlineFeedback message={waterFeedback ?? ""} variant={waterFeedbackVariant} />
        <div>
          <p className="text-2xl font-bold">{waterTotal} ml <span className="text-base font-semibold text-muted-foreground">/ {(waterTotal / 1000).toFixed(2)} L</span></p>
          <p className="text-sm text-muted-foreground">Goal {waterGoal} ml / {(waterGoal / 1000).toFixed(2)} L</p>
          <p className="mt-1 text-xs text-muted-foreground">Water is logged directly because it does not need AI.</p>
          {targetHit ? <p className="mt-1 text-xs font-semibold text-success">Water target reached for today.</p> : null}
          <Progress value={percent(waterTotal, waterGoal)} className="mt-3" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[250, 500, 750, 1000].map((amount) => {
            const isPending = pendingWaterKey === `add-${amount}`;
            return (
              <Button key={amount} type="button" variant="outline" className="min-h-12" onClick={() => onAddWater(amount)} disabled={Boolean(pendingWaterKey)}>
                {isPending ? "Adding..." : `+${amount === 1000 ? "1 L" : `${amount} ml`}`}
              </Button>
            );
          })}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input className="h-12" type="number" min="1" inputMode="numeric" enterKeyHint="done" value={customWaterMl} onChange={(event) => setCustomWaterMl(event.target.value)} />
          <Button type="button" className="min-h-12" onClick={() => onAddWater(Number(customWaterMl))} disabled={Boolean(pendingWaterKey)}>{customPending ? "Adding..." : "Add water"}</Button>
        </div>
        <div className="space-y-2">
          {waterLogs.map((log) => {
            const deleting = deletingWaterIds?.has(log.id) ?? false;
            return (
              <div key={log.id} className="solid-row flex items-center justify-between p-2 text-sm">
                <span>{log.amount_ml} ml</span>
                <Button type="button" variant="ghost" size="icon" className="h-12 w-12" onClick={() => onRemoveWater(log)} disabled={deleting || log.id.startsWith("optimistic-water-")} aria-label="Delete water log">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function CompactNutritionSummary({ totals, targets, waterTotal }: { totals: ReturnType<typeof sumFoodLogs>; targets: SavedTargets; waterTotal: number }) {
  const calorieProgress = percent(totals.calories, targets.daily_calories);
  const proteinProgress = percent(totals.protein_g, targets.protein_g);
  const carbsProgress = percent(totals.carbs_g, targets.carbs_g);
  const fatProgress = percent(totals.fat_g, targets.fat_g);
  const waterProgress = percent(waterTotal, targets.water_ml);
  const hasAnyTargets = targets.daily_calories > 0 || targets.protein_g > 0;

  return (
    <Card variant="glassStrong" className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-muted">
              <svg className="absolute inset-0 h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted" />
                <circle
                  cx="32" cy="32" r="28" fill="none" stroke={calorieProgressColor(calorieProgress)}
                  strokeWidth="4"
                  strokeDasharray={hasAnyTargets ? `${(calorieProgress / 100) * 175.9} 175.9` : "0 175.9"}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-sm font-bold">{totals.calories}</span>
            </div>
            <span className="text-[11px] text-muted-foreground">kcal</span>
          </div>
          <div className="flex-1 space-y-2">
            <MacroMiniBar label="Protein" value={totals.protein_g} target={targets.protein_g} progress={proteinProgress} color="var(--color-primary)" />
            <MacroMiniBar label="Carbs" value={totals.carbs_g} target={targets.carbs_g} progress={carbsProgress} color="var(--color-secondary)" />
            <MacroMiniBar label="Fat" value={totals.fat_g} target={targets.fat_g} progress={fatProgress} color="var(--color-text-secondary)" />
            <MacroMiniBar label="Water" value={waterTotal} target={targets.water_ml} progress={waterProgress} color="var(--color-success)" unit="ml" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MacroMiniBar({ label, value, target, progress, color, unit = "g" }: { label: string; value: number; target: number; progress: number; color: string; unit?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}{target > 0 ? ` / ${target}${unit}` : unit}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, progress)}%`, background: color }} />
      </div>
    </div>
  );
}

export function WaterMiniSummary({
  waterTotal,
  waterGoal,
  onAddWater,
  waterFeedback,
  waterFeedbackVariant = "info",
  pendingWaterKey
}: {
  waterTotal: number;
  waterGoal: number;
  onAddWater: (amount: number) => void;
  waterFeedback?: string;
  waterFeedbackVariant?: "info" | "error";
  pendingWaterKey?: string | null;
}) {
  const progress = percent(waterTotal, waterGoal);
  return (
    <div className="glass-card-strong p-3 shadow-soft">
      <InlineFeedback message={waterFeedback ?? ""} variant={waterFeedbackVariant} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Water</p>
          <p className="text-sm font-semibold">{waterTotal} ml / {(waterTotal / 1000).toFixed(2)} L <span className="block text-xs font-normal text-muted-foreground">Goal {waterGoal} ml / {(waterGoal / 1000).toFixed(2)} L</span></p>
          <p className="mt-1 text-xs text-muted-foreground">Water is logged directly because it does not need AI.</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {[250, 500].map((amount) => (
            <Button key={amount} variant="outline" className="min-h-12 px-3 text-xs" onClick={() => onAddWater(amount)} disabled={Boolean(pendingWaterKey)}>
              {pendingWaterKey === `add-${amount}` ? "Adding" : `+${amount} ml`}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
    </div>
  );
}
