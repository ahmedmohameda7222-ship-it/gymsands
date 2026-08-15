"use client";

import { useEffect, useMemo, useState } from "react";

import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import type { AdvancedExposureResult } from "@/lib/train/muscle-intelligence/advanced-exposure";
import type { MuscleLoadAnalysisResult } from "@/lib/train/muscle-intelligence/calculate-muscle-load";
import { projectBroadMuscleCompatibility, type BroadCompatibilityResult } from "@/lib/train/muscle-intelligence/compatibility-projection";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";
import type { Phase3SessionAnalysisContract } from "@/lib/train/muscle-intelligence/session-analysis-contract";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getWorkoutHistoryTrainingFocus } from "@/services/workouts/history/training-focus-client";

type Analysis = AdvancedExposureResult | BroadCompatibilityResult;

function analysisFor(result: Phase3SessionAnalysisContract): Analysis | null {
  if (result.snapshotSchemaVersion === "workout_session_muscle_snapshot_v1") return projectBroadMuscleCompatibility(result.analysis as MuscleLoadAnalysisResult);
  return result.analysis as Analysis | null;
}

export function SessionHistoryMuscleSummary({ sessionId, accessToken }: { sessionId: string; accessToken?: string | null }) {
  const { language, tr } = useTrainTranslation();
  const labels = useMemo(() => getMuscleHeatMapLabels(language), [language]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "partial" | "unavailable">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    void getWorkoutHistoryTrainingFocus(sessionId, { accessToken, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      const projected = analysisFor(result);
      const hasExposure = projected?.kind === "advanced" ? projected.targets.some((target) => target.rawExposure > 0) : projected?.targets.some((target) => target.heatLevel !== "none");
      setAnalysis(projected);
      setState(!projected || !hasExposure || result.effectiveCompleteness === "unavailable" ? "unavailable" : result.effectiveCompleteness === "complete" ? "ready" : "partial");
    }).catch(() => { if (!controller.signal.aborted) setState("unavailable"); });
    return () => controller.abort();
  }, [accessToken, sessionId]);

  if (state === "unavailable") return null;
  const exposed = analysis?.kind === "advanced"
    ? analysis.targets.filter((target) => target.rawExposure > 0).map((target) => ({ id: target.targetId, score: target.rawExposure, label: labels.targetName(`train.muscleAtlas.targets.${target.targetId}.name`) }))
    : analysis?.targets.filter((target) => target.heatLevel !== "none").map((target) => ({ id: target.targetId, score: target.heatLevel === "high" ? 3 : target.heatLevel === "moderate" ? 2 : 1, label: labels.broadTargetName(target.broadMuscleId) })) ?? [];
  const highestScore = Math.max(0, ...exposed.map((target) => target.score));
  const highest = exposed.filter((target) => target.score === highestScore);
  const also = exposed.filter((target) => target.score !== highestScore);

  return (
    <section
      className="border-t border-border/70 pt-5"
      aria-labelledby="session-history-muscle-title"
      data-session-history-muscle-summary
      data-history-muscle-analysis-kind={analysis?.kind === "advanced" ? "v2-advanced" : analysis?.kind === "broad_compatibility" ? "v1-broad" : undefined}
    >
      <h2 id="session-history-muscle-title" className="text-lg font-semibold text-foreground">{tr("historyTrainingFocus")}</h2>
      {state === "loading" ? <div className="mt-3 h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-label={tr("historyDetailLoading")} /> : (
        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(180px,260px)_1fr] sm:items-center">
          <MuscleHeatMap mode="compact" view="both" state={state} analysis={analysis} labels={labels} showLegend={false} showViewLabels={false} showStateMessage={false} className="max-h-[180px] overflow-hidden" />
          <div className="space-y-3 text-sm">
            {highest.length ? <div><p className="font-medium text-foreground">{tr("historyHighestExposure")}</p><p className="mt-1 text-muted-foreground">{highest.map((target) => target.label).join(" · ")}</p></div> : null}
            {also.length ? <div><p className="font-medium text-foreground">{tr("historyAlsoTrained")}</p><p className="mt-1 text-muted-foreground">{also.map((target) => target.label).join(" · ")}</p></div> : null}
          </div>
        </div>
      )}
    </section>
  );
}
