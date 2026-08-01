"use client";

import { useMemo } from "react";

import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import { useActiveWorkoutMuscleLoad } from "@/components/workouts/active-workout/active-workout-muscle-load-controller";
import { env } from "@/lib/env";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";

function LiveSessionHistoryMuscleSummary({ sessionId }: { sessionId: string }) {
  const { language, tr } = useTrainTranslation();
  const controller = useActiveWorkoutMuscleLoad({ sessionId, refreshRevision: 0, mode: "completed" });
  const labels = useMemo(() => getMuscleHeatMapLabels(language), [language]);
  if (["empty", "unavailable", "error"].includes(controller.state)) return null;
  return (
    <section className="rounded-[18px] border border-border/70 bg-card p-4 shadow-sm" aria-labelledby="session-history-muscle-title" data-session-history-muscle-summary>
      <h2 id="session-history-muscle-title" className="text-base font-semibold text-foreground">{tr("historyMuscleSummary")}</h2>
      {controller.state === "loading" ? (
        <div className="mx-auto mt-3 h-[140px] max-w-[220px] animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-label={tr("historyDetailLoading")} />
      ) : (
        <MuscleHeatMap
          mode="compact"
          view="both"
          state={controller.state}
          analysis={controller.analysis}
          labels={labels}
          showLegend={false}
          showViewLabels={false}
          showStateMessage={false}
          className="mx-auto mt-3 max-h-[150px] max-w-[220px] overflow-hidden lg:max-h-[220px]"
        />
      )}
    </section>
  );
}

export function SessionHistoryMuscleSummary({ sessionId }: { sessionId: string }) {
  if (env.useMockAuth) return null;
  return <LiveSessionHistoryMuscleSummary sessionId={sessionId} />;
}
