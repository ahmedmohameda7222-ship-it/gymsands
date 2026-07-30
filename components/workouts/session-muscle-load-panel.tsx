"use client";

import { useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";

import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveWorkoutMuscleLoad } from "@/components/workouts/active-workout/active-workout-muscle-load-controller";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";
import { cn } from "@/lib/utils";

type SessionMuscleLoadPanelProps = {
  sessionId: string;
  refreshRevision: number;
  className?: string;
};

export function SessionMuscleLoadPanel({
  sessionId,
  refreshRevision,
  className
}: SessionMuscleLoadPanelProps) {
  const { t, locale } = useActiveWorkoutTranslation();
  const [mobileView, setMobileView] = useState<"front" | "back">("front");
  const muscleLoad = useActiveWorkoutMuscleLoad({ sessionId, refreshRevision });
  const baseLabels = useMemo(() => getMuscleHeatMapLabels(locale), [locale]);
  const labels = useMemo(() => ({
    ...baseLabels,
    frontView: t("heatMap.front"),
    backView: t("heatMap.back"),
    loading: t("common.loading"),
    empty: t("heatMap.noSavedWorkingSets"),
    partial: t("heatMap.partialMapping"),
    unavailable: t("heatMap.unavailable"),
    error: t("heatMap.couldNotRefresh"),
    close: t("heatMap.closeFullMap")
  }), [baseLabels, t]);

  const copy = {
    title: t("heatMap.currentSessionHeat"),
    description: t("heatMap.currentSessionDescription"),
    savedOnly: t("heatMap.savedSetsOnly"),
    updating: t("heatMap.updating"),
    noSavedSets: t("heatMap.noSavedWorkingSets"),
    partial: t("heatMap.partialDescription"),
    unavailable: t("heatMap.unavailableDescription"),
    loadFailed: t("heatMap.refreshFailedDescription"),
    retry: t("heatMap.retry"),
    front: t("heatMap.front"),
    back: t("heatMap.back")
  };

  const { analysis, state, refreshing, failed, hasCachedResult, reload } = muscleLoad;
  const disclosure = state === "empty"
    ? copy.noSavedSets
    : state === "partial"
      ? copy.partial
      : state === "unavailable"
        ? copy.unavailable
        : state === "error"
          ? copy.loadFailed
          : null;

  return (
    <Card
      className={cn("overflow-hidden rounded-[24px] border-border/70 bg-card/80", className)}
      data-phase4c2-active-muscle-load
      data-refresh-revision={refreshRevision}
    >
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{copy.title}</h2>
              <span className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {copy.savedOnly}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
          </div>
          {refreshing ? (
            <RefreshCcw
              className="mt-1 h-4 w-4 shrink-0 motion-safe:animate-spin text-muted-foreground"
              aria-label={copy.updating}
            />
          ) : null}
        </div>

        {failed && hasCachedResult ? (
          <div className="flex flex-col gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">{copy.loadFailed}</p>
            <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={reload}>
              {copy.retry}
            </Button>
          </div>
        ) : null}

        <div
          className="flex justify-center gap-2 sm:hidden"
          aria-label={`${copy.front} / ${copy.back}`}
        >
          <Button
            type="button"
            size="sm"
            variant={mobileView === "front" ? "default" : "outline"}
            aria-pressed={mobileView === "front"}
            aria-label={t("accessibility.switchFront")}
            onClick={() => setMobileView("front")}
          >
            {copy.front}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mobileView === "back" ? "default" : "outline"}
            aria-pressed={mobileView === "back"}
            aria-label={t("accessibility.switchBack")}
            onClick={() => setMobileView("back")}
          >
            {copy.back}
          </Button>
        </div>

        <div className="sm:hidden">
          <MuscleHeatMap
            mode="interactive"
            view={mobileView}
            state={state}
            analysis={analysis}
            showLegend={false}
            labels={labels}
            disclosure={disclosure}
            statusDetails={refreshing ? copy.updating : undefined}
          />
        </div>
        <div className="hidden sm:block">
          <MuscleHeatMap
            mode="interactive"
            view="both"
            state={state}
            analysis={analysis}
            showLegend={false}
            labels={labels}
            disclosure={disclosure}
            statusDetails={refreshing ? copy.updating : undefined}
          />
        </div>

        {failed && !hasCachedResult ? (
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={reload}>
            <RefreshCcw className="me-2 h-4 w-4" />
            {copy.retry}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
