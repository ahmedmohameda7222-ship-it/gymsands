"use client";

import { useMemo, useState } from "react";

import { MuscleHeatMap, type MuscleHeatMapState } from "@/components/train/muscle-heat-map/muscle-heat-map";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SupportedLanguage } from "@/lib/i18n/types";
import {
  getMuscleHeatMapLabels,
  getMuscleIntelligenceCopy,
  interpolateMuscleCopy
} from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";
import {
  calculatePlanAdvancedMuscleExposure,
  type PlanMuscleDayLike
} from "@/lib/train/muscle-intelligence/plan-advanced-analysis";
import { cn } from "@/lib/utils";

export type PlanMuscleLoadPanelProps = {
  days: readonly PlanMuscleDayLike[];
  activeDayIndex?: number;
  defaultScope: "current_day" | "entire_plan";
  variant: "builder" | "review" | "details";
  language: SupportedLanguage;
  className?: string;
};

function stateForAnalysis(
  analysis: ReturnType<typeof calculatePlanAdvancedMuscleExposure> | null,
  failed: boolean
): MuscleHeatMapState {
  if (failed) return "error";
  if (!analysis || analysis.coverage.totalItemCount === 0) return "empty";
  if (analysis.completeness === "partial") return "partial";
  if (analysis.completeness === "unavailable") return "unavailable";
  return "ready";
}

export function PlanMuscleLoadPanel({
  days,
  activeDayIndex = 0,
  defaultScope,
  variant,
  language,
  className
}: PlanMuscleLoadPanelProps) {
  const [scope, setScope] = useState<"current_day" | "entire_plan">(defaultScope);
  const [mobileView, setMobileView] = useState<"front" | "back">("front");
  const resolvedLanguage = language ?? "en";
  const text = getMuscleIntelligenceCopy(resolvedLanguage);
  const labels = useMemo(() => getMuscleHeatMapLabels(resolvedLanguage), [resolvedLanguage]);
  const calculation = useMemo(() => {
    try {
      return {
        analysis: calculatePlanAdvancedMuscleExposure({ days, scope, activeDayIndex }),
        failed: false
      };
    } catch {
      return { analysis: null, failed: true };
    }
  }, [activeDayIndex, days, scope]);
  const state = stateForAnalysis(calculation.analysis, calculation.failed);
  const title = variant === "review" ? text.balanceTitle : variant === "details" ? text.weeklyTitle : text.plannedTitle;
  const description = variant === "review"
    ? text.balanceDescription
    : variant === "details"
      ? text.weeklyDescription
      : text.plannedDescription;
  const coverage = calculation.analysis?.coverage ?? { totalItemCount: 0, includedItemCount: 0, unmappedItemCount: 0 };
  const coverageText = interpolateMuscleCopy(text.covered, {
    included: coverage.includedItemCount,
    total: coverage.totalItemCount
  });
  const disclosure = state === "partial"
    ? text.partialDisclosure
    : state === "unavailable"
      ? text.unavailableDisclosure
      : state === "empty"
        ? text.emptyDisclosure
        : null;

  const content = (
    <Card className={cn("overflow-hidden", className)} data-phase4b-plan-muscle-load data-variant={variant}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className={variant === "details" ? "text-lg font-semibold" : "text-xl font-semibold"}>{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          {variant !== "details" ? (
            <div className="inline-flex w-full rounded-xl border p-1 sm:w-auto" aria-label={title}>
              <Button
                type="button"
                size="sm"
                variant={scope === "current_day" ? "default" : "ghost"}
                className="min-h-10 flex-1 sm:flex-none"
                aria-pressed={scope === "current_day"}
                onClick={() => setScope("current_day")}
              >
                {text.currentDay}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "entire_plan" ? "default" : "ghost"}
                className="min-h-10 flex-1 sm:flex-none"
                aria-pressed={scope === "entire_plan"}
                onClick={() => setScope("entire_plan")}
              >
                {text.entirePlan}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm">
          <span className="font-medium">{text.coverage}</span>
          <span className="text-muted-foreground">{coverageText}</span>
        </div>

        <div className="flex justify-center gap-2 sm:hidden" aria-label={`${text.front} / ${text.back}`}>
          <Button type="button" size="sm" variant={mobileView === "front" ? "default" : "outline"} aria-pressed={mobileView === "front"} onClick={() => setMobileView("front")}>{text.front}</Button>
          <Button type="button" size="sm" variant={mobileView === "back" ? "default" : "outline"} aria-pressed={mobileView === "back"} onClick={() => setMobileView("back")}>{text.back}</Button>
        </div>

        <div className="sm:hidden">
          <MuscleHeatMap
            mode={variant === "details" ? "compact" : "interactive"}
            view={mobileView}
            state={state}
            analysis={calculation.analysis}
            showLegend={variant !== "details"}
            labels={labels}
            disclosure={disclosure}
          />
        </div>
        <div className="hidden sm:block">
          <MuscleHeatMap
            mode={variant === "details" ? "compact" : "interactive"}
            view="both"
            state={state}
            analysis={calculation.analysis}
            showLegend={variant !== "details"}
            labels={labels}
            disclosure={disclosure}
          />
        </div>
      </CardContent>
    </Card>
  );

  if (variant !== "details") return content;

  return (
    <details className="group" data-phase4b-weekly-muscle-load>
      <summary className="min-h-12 cursor-pointer list-none rounded-2xl border border-border/70 bg-card px-4 py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {text.weeklyTitle}
        <span className="ms-2 text-sm font-normal text-muted-foreground">{coverageText}</span>
      </summary>
      <div className="mt-3">{content}</div>
    </details>
  );
}
