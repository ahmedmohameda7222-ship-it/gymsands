"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";

import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import { Button } from "@/components/ui/button";
import type { ActiveWorkoutMuscleLoadController } from "@/components/workouts/active-workout/active-workout-muscle-load-controller";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";

export function ActiveWorkoutMuscleLoadSection({
  controller
}: {
  controller: ActiveWorkoutMuscleLoadController;
}) {
  const { t, locale } = useActiveWorkoutTranslation();
  const [mobileView, setMobileView] = useState<"front" | "back">("front");
  const [showBothViews, setShowBothViews] = useState(false);
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
  const disclosure = controller.state === "empty"
    ? t("heatMap.noSavedWorkingSets")
    : controller.state === "partial"
      ? t("heatMap.partialDescription")
      : controller.state === "unavailable"
        ? t("heatMap.unavailableDescription")
        : controller.state === "error"
          ? t("heatMap.refreshFailedDescription")
          : null;

  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const update = () => setShowBothViews(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div data-aw6-muscle-load-section data-state={controller.state}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {t("heatMap.savedSetsOnly")}
        </span>
        {controller.refreshing ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <RefreshCcw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
            {t("heatMap.updating")}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("heatMap.currentSessionDescription")}
      </p>

      {controller.failed && controller.hasCachedResult ? (
        <div
          className="mt-3 flex flex-col gap-2 rounded-[var(--radius-md)] border border-destructive/25 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="text-muted-foreground">
            {t("heatMap.refreshFailedDescription")} {t("heatMap.showingLastAvailable")}.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-10"
            onClick={controller.reload}
          >
            {t("heatMap.retry")}
          </Button>
        </div>
      ) : null}

      {!showBothViews ? (
        <div
          className="mt-4 flex justify-center gap-2"
          aria-label={`${t("heatMap.front")} / ${t("heatMap.back")}`}
        >
          <Button
            type="button"
            size="sm"
            variant={mobileView === "front" ? "default" : "outline"}
            aria-pressed={mobileView === "front"}
            aria-label={t("accessibility.switchFront")}
            onClick={() => setMobileView("front")}
          >
            {t("heatMap.front")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mobileView === "back" ? "default" : "outline"}
            aria-pressed={mobileView === "back"}
            aria-label={t("accessibility.switchBack")}
            onClick={() => setMobileView("back")}
          >
            {t("heatMap.back")}
          </Button>
        </div>
      ) : null}

      <div className="mt-4">
        <MuscleHeatMap
          mode="interactive"
          view={showBothViews ? "both" : mobileView}
          state={controller.state}
          analysis={controller.analysis}
          showLegend={false}
          labels={labels}
          disclosure={disclosure}
          statusDetails={controller.refreshing ? t("heatMap.updating") : undefined}
        />
      </div>

      {controller.failed && !controller.hasCachedResult ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11 w-full"
          onClick={controller.reload}
        >
          <RefreshCcw className="me-2 h-4 w-4" aria-hidden="true" />
          {t("heatMap.retry")}
        </Button>
      ) : null}
    </div>
  );
}
