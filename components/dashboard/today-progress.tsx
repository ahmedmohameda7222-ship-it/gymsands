"use client";

import { Activity, Droplets, Flame, Soup, Utensils } from "lucide-react";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatEnergy, formatLiquid } from "@/lib/dashboard/today-units";
import { interpolateFocusedTodayCopy, type FocusedTodayCopy } from "@/lib/dashboard/focused-today-copy";
import { resolveProgressMetricState, type ProgressMetricState, type ProgressSourceState } from "@/lib/dashboard/progress-metric-state";
import { clearClientErrorDiagnosticState, setClientErrorDiagnosticState } from "@/lib/observability/client-error";
import { cn } from "@/lib/utils";
import type { SavedTargets } from "@/services/nutrition/targets";

type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

type MetricDefinition = {
  key: "calories" | "protein" | "carbs" | "fat" | "water";
  label: string;
  icon: React.ReactNode;
  state: ProgressMetricState;
  format: (value: number) => string;
  neutralOver?: boolean;
};

export function TodayProgress({
  totals,
  logsState,
  targets,
  targetsState,
  waterTotal,
  hydrationState,
  energyUnit,
  liquidUnit,
  copy
}: {
  totals: MacroTotals | null;
  logsState: ProgressSourceState;
  targets: SavedTargets | null;
  targetsState: ProgressSourceState;
  waterTotal: number | null;
  hydrationState: ProgressSourceState;
  energyUnit: "kcal" | "kJ";
  liquidUnit: "ml" | "oz";
  copy: FocusedTodayCopy;
}) {
  useEffect(() => {
    setClientErrorDiagnosticState({
      hasTargets: Boolean(targets),
      hasFoodLogs: totals !== null && Object.values(totals).some((value) => Number(value) !== 0),
      targetLoadState: targetsState,
      foodLogLoadState: logsState
    });
    return clearClientErrorDiagnosticState;
  }, [logsState, targets, targetsState, totals]);

  const macroState = (consumed: number | null, target: number | null) => resolveProgressMetricState({ consumed, target, consumedState: logsState, targetState: targetsState });
  const waterState = resolveProgressMetricState({ consumed: waterTotal, target: targets?.water_ml ?? null, consumedState: hydrationState, targetState: targetsState });
  const grams = (value: number) => `${Math.round(value)} g`;
  const metrics: MetricDefinition[] = [
    { key: "calories", label: copy.calories, icon: <Flame className="h-5 w-5" />, state: macroState(totals?.calories ?? null, targets?.daily_calories ?? null), format: (value) => formatEnergy(value, energyUnit) },
    { key: "protein", label: copy.protein, icon: <Soup className="h-5 w-5" />, state: macroState(totals?.protein_g ?? null, targets?.protein_g ?? null), format: grams },
    { key: "carbs", label: copy.carbs, icon: <Utensils className="h-5 w-5" />, state: macroState(totals?.carbs_g ?? null, targets?.carbs_g ?? null), format: grams },
    { key: "fat", label: copy.fat, icon: <Activity className="h-5 w-5" />, state: macroState(totals?.fat_g ?? null, targets?.fat_g ?? null), format: grams },
    { key: "water", label: copy.water, icon: <Droplets className="h-5 w-5" />, state: waterState, format: (value) => formatLiquid(value, liquidUnit), neutralOver: true }
  ];

  return (
    <section aria-labelledby="today-progress" aria-busy={logsState === "loading" || hydrationState === "loading"}>
      <h2 id="today-progress" className="mb-2 text-base font-semibold">{copy.todayProgress}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => <ProgressMetric key={metric.key} metric={metric} copy={copy} />)}
      </div>
    </section>
  );
}

function ProgressMetric({ metric, copy }: { metric: MetricDefinition; copy: FocusedTodayCopy }) {
  const { state } = metric;
  const value = state.consumed === null ? (state.status === "loading" ? copy.loading : copy.unavailable) : metric.format(state.consumed);
  let detail = copy.noTarget;
  if (state.status === "loading") detail = copy.loading;
  else if (state.status === "unavailable") detail = copy.unavailable;
  else if (state.status === "target-unavailable") detail = copy.targetUnavailable;
  else if (state.status === "no-target") detail = copy.noTarget;
  else if (state.status === "over" && !metric.neutralOver && state.overBy !== null) detail = interpolateFocusedTodayCopy(copy.overTargetValue, { value: metric.format(state.overBy) });
  else if (state.status === "under" && state.remaining !== null) detail = interpolateFocusedTodayCopy(copy.remainingValue, { value: metric.format(state.remaining) });
  else if (state.target !== null) detail = interpolateFocusedTodayCopy(copy.targetValue, { value: metric.format(state.target) });

  const over = state.status === "over" && !metric.neutralOver;
  return (
    <Card className={cn("h-full", over && "border-warning/45 bg-warning/5")}>
      <CardContent className="flex h-full min-h-[132px] flex-col p-3 sm:p-4">
        <div className="flex items-center gap-2 text-primary">
          {metric.icon}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{metric.label}</span>
        </div>
        <p className="mt-3 text-lg font-bold sm:text-xl">{value}</p>
        <p className={cn("mt-1 min-h-8 text-xs text-muted-foreground", over && "font-semibold text-warning")} aria-live="polite">{detail}</p>
        {state.progress !== undefined ? <Progress value={state.progress} className="mt-auto" aria-label={`${metric.label}: ${Math.round(state.progress)}%`} /> : null}
      </CardContent>
    </Card>
  );
}
