"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Droplets, RefreshCcw, RotateCcw, Utensils } from "lucide-react";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { InlineFeedback } from "@/components/motion";
import { formatEatEnergy, formatEatLiquid } from "@/lib/eat/eat-units";
import type { NutritionMetric, RepeatFoodOption, SourceState } from "@/lib/eat/eat-model";
import { useEatTranslation } from "@/lib/i18n/eat";
import type { ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { UserAppSettings } from "@/services/database/user-settings";
import type { MealPlanItem, MealType, WaterLog } from "@/types";

function metricName(key: NutritionMetric["key"], et: ReturnType<typeof useEatTranslation>["et"]) {
  return key === "calories" ? et("calories") : key === "protein_g" ? et("protein") : key === "carbs_g" ? et("carbs") : et("fat");
}
function metricValue(metric: NutritionMetric, energyUnit: UserAppSettings["energyUnit"], locale: string) {
  if (metric.consumed === null) return "—";
  return metric.key === "calories" ? formatEatEnergy(metric.consumed, energyUnit, locale) : `${Math.round(metric.consumed * 10) / 10} g`;
}
function metricTarget(metric: NutritionMetric, energyUnit: UserAppSettings["energyUnit"], locale: string) {
  if (metric.target === null) return "—";
  return metric.key === "calories" ? formatEatEnergy(metric.target, energyUnit, locale) : `${Math.round(metric.target * 10) / 10} g`;
}
function metricRemaining(metric: NutritionMetric, energyUnit: UserAppSettings["energyUnit"], locale: string, remainingLabel: string, aboveLabel: string) {
  if (metric.remaining === null) return "—";
  const amount = metric.key === "calories" ? formatEatEnergy(Math.abs(metric.remaining), energyUnit, locale) : `${Math.round(Math.abs(metric.remaining) * 10) / 10} g`;
  return metric.remaining >= 0 ? `${amount} ${remainingLabel}` : `${amount} ${aboveLabel}`;
}
function progressClass(state: NutritionMetric["state"]) {
  if (state === "near") return "[&>div]:bg-success";
  if (state === "over") return "[&>div]:bg-warning";
  if (state === "materially-over") return "[&>div]:bg-destructive";
  return "";
}

export function EatNutritionProgress({ metrics, activeTarget, selectedDate, energyUnit, onRetryTargets }: {
  metrics: NutritionMetric[]; activeTarget: SourceState<ActiveNutritionTarget | null>; selectedDate: string; energyUnit: UserAppSettings["energyUnit"]; onRetryTargets: () => void;
}) {
  const { et, locale } = useEatTranslation();
  const calories = metrics.find((metric) => metric.key === "calories")!;
  const target = activeTarget.status === "loaded" ? activeTarget.data : null;
  const targetLabel = target?.sourceType === "training_day" ? et("trainingTarget") : target?.sourceType === "rest_day" ? et("restTarget") : target?.sourceType === "high_activity_day" ? et("highActivityTarget") : target?.hasTarget ? et("fallbackTarget") : et("targetUnavailable");
  const manageHref = `/settings/nutrition-targets?date=${encodeURIComponent(selectedDate)}&return=${encodeURIComponent(`/calories?date=${selectedDate}&view=day`)}`;
  return <Card className="overflow-hidden border-primary/20"><CardContent className="space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">{targetLabel}{target?.values.daily_calories ? ` · ${formatEatEnergy(target.values.daily_calories, energyUnit, locale)}` : ""}</p>{activeTarget.status === "failed" ? <p className="mt-1 text-xs text-destructive">{et("targetsFailed")}</p> : null}</div>{activeTarget.status === "failed" ? <Button type="button" variant="outline" size="sm" onClick={onRetryTargets}><RefreshCcw className="h-4 w-4" />{et("retry")}</Button> : <Button asChild type="button" variant="outline" size="sm"><Link href={manageHref}>{target?.hasTarget ? et("manage") : et("setTarget")}</Link></Button>}</div>
    <div className="space-y-2"><div className="flex items-end justify-between gap-3"><div><p className="text-3xl font-extrabold tracking-tight">{metricValue(calories, energyUnit, locale)}{calories.target !== null ? <span className="text-base font-medium text-muted-foreground"> / {metricTarget(calories, energyUnit, locale)}</span> : null}</p><p className="mt-1 text-sm text-muted-foreground">{metricRemaining(calories, energyUnit, locale, et("remaining"), et("aboveTarget"))}</p></div><Badge variant={calories.state === "materially-over" ? "destructive" : calories.state === "over" ? "warning" : calories.state === "near" ? "success" : "outline"}>{calories.state === "unavailable" ? et("unavailable") : calories.state === "near" ? et("targetHit") : `${Math.round(calories.percent ?? 0)}%`}</Badge></div><Progress value={Math.min(100, calories.percent ?? 0)} className={progressClass(calories.state)} aria-label={`${et("calories")} ${calories.percent ?? 0}%`} /></div>
    <div className="grid gap-2 sm:grid-cols-3">{metrics.filter((metric) => metric.key !== "calories").map((metric) => <div key={metric.key} className="rounded-[14px] border border-border/70 bg-muted/25 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{metricName(metric.key, et)}</p><span className="text-xs text-muted-foreground">{metric.percent === null ? "—" : `${Math.round(metric.percent)}%`}</span></div><p className="mt-1 text-sm font-semibold">{metricValue(metric, energyUnit, locale)}{metric.target !== null ? ` / ${metricTarget(metric, energyUnit, locale)}` : ""}</p><Progress value={Math.min(100, metric.percent ?? 0)} className={`mt-2 ${progressClass(metric.state)}`} aria-label={`${metricName(metric.key, et)} ${metric.percent ?? 0}%`} /></div>)}</div>
  </CardContent></Card>;
}

export function PlannedNextMeal({ item, pending, chatGptPending, energyUnit, onMarkEaten, onAdjust, onReplace }: {
  item: MealPlanItem | null; pending: boolean; chatGptPending: boolean; energyUnit: UserAppSettings["energyUnit"];
  onMarkEaten: (item: MealPlanItem) => void; onAdjust: (item: MealPlanItem) => void; onReplace: (item: MealPlanItem) => void;
}) {
  const { et, mealLabel, locale } = useEatTranslation();
  if (!item) return null;
  return <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Utensils className="h-4 w-4 text-primary" />{et("plannedNextMeal")}</CardTitle></CardHeader><CardContent className="space-y-3"><div><p className="font-semibold text-foreground">{item.food_name}</p><p className="mt-1 text-sm text-muted-foreground">{mealLabel(item.meal_type)} · {formatEatEnergy(item.calories, energyUnit, locale)} · {item.quantity} × {item.serving_size}</p></div><div className="grid gap-2 sm:grid-cols-3"><Button className="min-h-12" onClick={() => onMarkEaten(item)} disabled={pending || chatGptPending}><CheckCircle2 className="h-4 w-4" />{pending ? et("logging") : et("markEaten")}</Button><Button className="min-h-12" variant="outline" onClick={() => onAdjust(item)} disabled={pending || chatGptPending}>{et("adjustFirst")}</Button><Button className="min-h-12" variant="outline" onClick={() => onReplace(item)} disabled={pending || chatGptPending}>{chatGptPending ? <RotateCcw className="h-4 w-4 animate-spin" /> : <OpenAiBlossom className="h-4 w-4" />}{et("adjustWithChatGpt")}</Button></div></CardContent></Card>;
}

export function RepeatFoodSection({ options, selectedDate, mealType, pendingKey, feedback, energyUnit, onMealTypeChange, onRepeat, onViewAll }: {
  options: RepeatFoodOption[]; selectedDate: string; mealType: MealType; pendingKey: string | null; feedback?: string; energyUnit: UserAppSettings["energyUnit"];
  onMealTypeChange: (type: MealType) => void; onRepeat: (option: RepeatFoodOption) => void; onViewAll: () => void;
}) {
  const { et, formatDate, mealLabel, locale } = useEatTranslation();
  const scroller = useRef<HTMLDivElement | null>(null);
  if (!options.length) return null;
  const move = (direction: number) => scroller.current?.scrollBy({ left: direction * Math.max(240, scroller.current.clientWidth * 0.75), behavior: "smooth" });
  return <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3"><div><CardTitle className="text-base">{et("repeatFood")}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{formatDate(selectedDate)} · {mealLabel(mealType)}</p></div><select value={mealType} onChange={(event) => onMealTypeChange(event.target.value as MealType)} className="h-11 rounded-[12px] border border-border bg-card px-3 text-sm" aria-label={et("meal")}>{(["Breakfast", "Lunch", "Dinner", "Snack"] as MealType[]).map((type) => <option key={type} value={type}>{mealLabel(type)}</option>)}</select></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" onClick={() => move(-1)} aria-label={et("previousItems")}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button><div ref={scroller} tabIndex={0} role="region" aria-label={et("repeatFood")} className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">{options.map((option) => <Button key={option.repeatKey} type="button" variant="outline" className="min-h-12 shrink-0" onClick={() => onRepeat(option)} disabled={Boolean(pendingKey)}>{pendingKey === option.repeatKey ? <RotateCcw className="h-4 w-4 animate-spin" /> : null}<span>{option.food_name}<span className="ms-1 text-xs text-muted-foreground">· {formatEatEnergy(option.calories, energyUnit, locale)}</span></span></Button>)}<Button type="button" variant="ghost" className="min-h-12 shrink-0" onClick={onViewAll}>{et("viewAll")}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button></div><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" onClick={() => move(1)} aria-label={et("nextItems")}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button></div><InlineFeedback message={feedback} /></CardContent></Card>;
}

export function RemainingToday({ metrics, energyUnit }: { metrics: NutritionMetric[]; energyUnit: UserAppSettings["energyUnit"] }) {
  const { et, locale } = useEatTranslation();
  const known = metrics.every((metric) => metric.remaining !== null);
  const protein = metrics.find((metric) => metric.key === "protein_g");
  const calories = metrics.find((metric) => metric.key === "calories");
  const next = !known ? et("logToContinue") : (protein?.remaining ?? 0) > 20 ? et("proteinDinner") : (calories?.remaining ?? 0) > 150 ? et("balancedMeal") : et("targetComplete");
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">{et("remainingToday")}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-2">{metrics.map((metric) => <div key={metric.key} className="rounded-[14px] border border-border/70 p-3"><p className="text-xs text-muted-foreground">{metricName(metric.key, et)}</p><p className="mt-1 font-semibold">{metric.remaining === null ? "—" : metric.key === "calories" ? formatEatEnergy(metric.remaining, energyUnit, locale) : `${Math.round(metric.remaining * 10) / 10} g`}</p></div>)}</div><div className="rounded-[14px] bg-primary/8 p-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{et("suggestedNext")}</p><p className="mt-1 text-sm font-semibold">{next}</p></div></CardContent></Card>;
}

export function CompactHydration({ water, waterTargetMl, liquidUnit, pending, feedback, onAdd, onRetry }: {
  water: SourceState<WaterLog[]>; waterTargetMl: number | null; liquidUnit: UserAppSettings["liquidUnit"]; pending: boolean; feedback?: string; onAdd: (amountMl: number) => void; onRetry: () => void;
}) {
  const { et, locale } = useEatTranslation();
  const total = water.status === "loaded" ? water.data.reduce((sum, log) => sum + Number(log.amount_ml || 0), 0) : null;
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="flex items-center gap-2 text-base"><Droplets className="h-4 w-4 text-primary" />{et("water")}</CardTitle>{water.status === "loaded" ? <Button asChild variant="ghost" size="sm"><Link href="/hydration">{et("more")}</Link></Button> : null}</CardHeader><CardContent className="space-y-3">{water.status === "failed" ? <div className="flex items-center justify-between gap-2"><p className="text-sm text-destructive">{et("hydrationUnavailable")}</p><Button variant="outline" size="sm" onClick={onRetry}><RefreshCcw className="h-4 w-4" />{et("retry")}</Button></div> : water.status === "loading" ? <p className="text-sm text-muted-foreground">{et("loading")}</p> : <><p className="text-2xl font-bold">{formatEatLiquid(total ?? 0, liquidUnit, locale)}{waterTargetMl ? <span className="text-sm font-medium text-muted-foreground"> / {formatEatLiquid(waterTargetMl, liquidUnit, locale)}</span> : null}</p><div className="grid grid-cols-2 gap-2"><Button variant="outline" className="min-h-12" onClick={() => onAdd(250)} disabled={pending}>+{formatEatLiquid(250, liquidUnit, locale)}</Button><Button variant="outline" className="min-h-12" onClick={() => onAdd(500)} disabled={pending}>+{formatEatLiquid(500, liquidUnit, locale)}</Button></div><InlineFeedback message={feedback} /></>}</CardContent></Card>;
}
