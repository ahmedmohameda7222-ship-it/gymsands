"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw } from "lucide-react";

import { MuscleHeatMap, type MuscleHeatMapState } from "@/components/train/muscle-heat-map/muscle-heat-map";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";
import type { AdvancedExposureResult } from "@/lib/train/muscle-intelligence/advanced-exposure";
import type { MuscleLoadAnalysisResult } from "@/lib/train/muscle-intelligence/calculate-muscle-load";
import {
  projectBroadMuscleCompatibility,
  type BroadCompatibilityResult
} from "@/lib/train/muscle-intelligence/compatibility-projection";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";
import type { Phase3SessionAnalysisContract } from "@/lib/train/muscle-intelligence/session-analysis-contract";
import { cn } from "@/lib/utils";

type HeatMapAnalysis = AdvancedExposureResult | BroadCompatibilityResult | null;

type SessionMuscleLoadPanelProps = {
  sessionId: string;
  refreshRevision: number;
  className?: string;
};

function resolveAnalysis(result: Phase3SessionAnalysisContract | null): HeatMapAnalysis {
  if (!result) return null;
  if (result.snapshotSchemaVersion === "workout_session_muscle_snapshot_v1") {
    return projectBroadMuscleCompatibility(result.analysis as MuscleLoadAnalysisResult);
  }
  return result.analysis as HeatMapAnalysis;
}

function hasExposure(analysis: HeatMapAnalysis): boolean {
  if (!analysis) return false;
  return analysis.kind === "advanced"
    ? analysis.targets.some((target) => target.rawExposure > 0)
    : analysis.targets.some((target) => target.heatLevel !== "none");
}

function resolveState(
  result: Phase3SessionAnalysisContract | null,
  analysis: HeatMapAnalysis,
  loading: boolean,
  failed: boolean
): MuscleHeatMapState {
  if (loading && !result) return "loading";
  if (failed && !result) return "error";
  if (!result || !analysis) return "unavailable";
  if (result.effectiveCompleteness === "unavailable") return "unavailable";
  if (!hasExposure(analysis)) return "empty";
  if (result.effectiveCompleteness === "partial" || result.effectiveCompleteness === "limited") return "partial";
  return "ready";
}

function isAnalysisPayload(value: unknown): value is Phase3SessionAnalysisContract {
  return Boolean(value && typeof value === "object" && "snapshotId" in value);
}

function responseError(value: unknown): string {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string" && value.error) {
    return value.error;
  }
  return "Active muscle load request failed.";
}

export function SessionMuscleLoadPanel({
  sessionId,
  refreshRevision,
  className
}: SessionMuscleLoadPanelProps) {
  const { t, locale } = useActiveWorkoutTranslation();
  const [result, setResult] = useState<Phase3SessionAnalysisContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mobileView, setMobileView] = useState<"front" | "back">("front");
  const requestGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<Phase3SessionAnalysisContract | null>(null);
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

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++requestGenerationRef.current;
    const hasPrevious = resultRef.current !== null;
    setLoading(!hasPrevious);
    setRefreshing(hasPrevious);
    setFailed(false);

    try {
      const response = await fetch(
        `/api/workouts/sessions/${encodeURIComponent(sessionId)}/muscle-analysis?mode=active`,
        { cache: "no-store", signal: controller.signal }
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isAnalysisPayload(payload)) throw new Error(responseError(payload));
      if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
      resultRef.current = payload;
      setResult(payload);
    } catch (error) {
      if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
      console.warn("Plaivra could not refresh active muscle load.", error);
      setFailed(true);
    } finally {
      if (!controller.signal.aborted && generation === requestGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
      requestGenerationRef.current += 1;
    };
  }, [load, refreshRevision]);

  const analysis = useMemo(() => resolveAnalysis(result), [result]);
  const state = resolveState(result, analysis, loading, failed);
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

        {failed && result ? (
          <div className="flex flex-col gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">{copy.loadFailed}</p>
            <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => void load()}>
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

        {failed && !result ? (
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => void load()}>
            <RefreshCcw className="me-2 h-4 w-4" />
            {copy.retry}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
