"use client";

import { useId, useMemo } from "react";
import { RefreshCcw } from "lucide-react";

import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import type { ActiveWorkoutMuscleLoadController } from "@/components/workouts/active-workout/active-workout-muscle-load-controller";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";
import { cn } from "@/lib/utils";

export function ActiveWorkoutMiniHeatMap({
  controller,
  onOpen
}: {
  controller: ActiveWorkoutMuscleLoadController;
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  const { t, locale } = useActiveWorkoutTranslation();
  const descriptionId = useId();
  const labels = useMemo(() => getMuscleHeatMapLabels(locale), [locale]);
  const stateDescription = controller.refreshing
    ? t("heatMap.updating")
    : controller.failed && controller.hasCachedResult
      ? `${t("heatMap.couldNotRefresh")}. ${t("heatMap.showingLastAvailable")}.`
      : controller.state === "loading"
        ? t("common.loading")
        : controller.state === "empty"
          ? t("heatMap.noSavedWorkingSets")
          : controller.state === "partial"
            ? t("heatMap.partialDescription")
            : controller.state === "unavailable"
              ? t("heatMap.unavailableDescription")
              : controller.state === "error"
                ? t("heatMap.refreshFailedDescription")
                : t("heatMap.savedSetsOnly");

  return (
    <button
      data-aw6-mini-heat-map
      data-state={controller.state}
      data-refreshing={controller.refreshing ? "true" : "false"}
      type="button"
      aria-label={t("heatMap.currentSessionMuscleLoad")}
      aria-describedby={descriptionId}
      title={t("heatMap.currentSessionDescription")}
      onClick={(event) => onOpen(event.currentTarget)}
      className={cn(
        "relative flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-border/70 bg-muted/20 p-1 outline-none transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-[64px] sm:w-[64px] lg:h-[68px] lg:w-[68px]",
        controller.state === "partial" && "border-dashed border-amber-500/60",
        controller.failed && controller.hasCachedResult && "border-destructive/45"
      )}
    >
      <MuscleHeatMap
        mode="compact"
        view="both"
        state={controller.state}
        analysis={controller.analysis}
        labels={labels}
        showLegend={false}
        showViewLabels={false}
        showStateMessage={false}
        className="w-full [&_[data-atlas-view]]:rounded-[4px] [&_[data-atlas-view]]:border-border/50 [&_[data-atlas-view]]:shadow-none"
      />
      {controller.refreshing ? (
        <span
          className="absolute end-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-muted-foreground"
          aria-hidden="true"
        >
          <RefreshCcw className="h-2.5 w-2.5 motion-safe:animate-spin" />
        </span>
      ) : null}
      {controller.state === "partial" && !controller.refreshing ? (
        <span
          className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500"
          aria-hidden="true"
        />
      ) : null}
      {controller.failed && controller.hasCachedResult && !controller.refreshing ? (
        <span
          className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive"
          aria-hidden="true"
        />
      ) : null}
      <span id={descriptionId} className="sr-only" aria-live="polite">
        {stateDescription}
      </span>
    </button>
  );
}
