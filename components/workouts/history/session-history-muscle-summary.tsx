"use client";

import { useEffect, useMemo, useState } from "react";

import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import { useActiveWorkoutMuscleLoad } from "@/components/workouts/active-workout/active-workout-muscle-load-controller";
import { env } from "@/lib/env";
import { useTrainTranslation } from "@/lib/i18n/train";
import {
  calculateAdvancedExposure,
  type AdvancedMuscleMappingReference,
} from "@/lib/train/muscle-intelligence/advanced-exposure";
import { calculateMuscleLoad } from "@/lib/train/muscle-intelligence/calculate-muscle-load";
import { projectBroadMuscleCompatibility } from "@/lib/train/muscle-intelligence/compatibility-projection";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";

const QA_SCENARIO_KEY = "plaivra.qa.workout-history-scenario";

const qaAdvancedMapping: AdvancedMuscleMappingReference = {
  mappingSetId: "qa-history-v2-map",
  targetId: "qa-history-v2-exercise",
  targetType: "global_exercise",
  mappingVersion: 2,
  schemaVersion: "exercise_muscle_mapping_v2",
  checksum: "a".repeat(64),
  entries: [
    {
      muscleId: "pectoralis.upper",
      role: "primary",
      contribution: 1,
      sideScope: "bilateral",
      sortOrder: 1,
    },
    {
      muscleId: "triceps.lateral_head",
      role: "secondary",
      contribution: 0.5,
      sideScope: "bilateral",
      sortOrder: 2,
    },
    {
      muscleId: "deltoid.anterior",
      role: "stabilizer",
      contribution: 0,
      sideScope: "bilateral",
      sortOrder: 3,
    },
  ],
};

const qaAdvancedAnalysis = calculateAdvancedExposure({
  scope: "single_session",
  items: [
    {
      itemId: "qa-history-v2-item",
      mapping: qaAdvancedMapping,
      qualifyingSets: 5,
    },
  ],
});

const qaBroadAnalysis = projectBroadMuscleCompatibility(
  calculateMuscleLoad({
    mode: "completed",
    period: { kind: "session" },
    items: [
      {
        itemId: "qa-history-v1-item",
        mapping: {
          mappingSetId: "qa-history-v1-map",
          targetId: "qa-history-v1-exercise",
          targetType: "global_exercise",
          mappingVersion: 1,
          schemaVersion: "exercise_muscle_mapping_v1",
          checksum: "b".repeat(64),
          entries: [
            {
              muscleId: "pectoralis_major",
              role: "primary",
              contribution: 1,
              sideScope: "bilateral",
              sortOrder: 1,
            },
            {
              muscleId: "triceps_brachii",
              role: "secondary",
              contribution: 0.5,
              sideScope: "bilateral",
              sortOrder: 2,
            },
            {
              muscleId: "anterior_deltoid",
              role: "stabilizer",
              contribution: 0,
              sideScope: "bilateral",
              sortOrder: 3,
            },
          ],
        },
        workload: {
          model: "resistance_sets_v1",
          qualifyingSets: 5,
        },
      },
    ],
  }),
);

function SessionHistoryMuscleFrame({
  state,
  analysis,
  analysisKind,
}: {
  state: "ready" | "loading" | "partial";
  analysis: Parameters<typeof MuscleHeatMap>[0]["analysis"];
  analysisKind: "v1-broad" | "v2-advanced" | "live";
}) {
  const { language, tr } = useTrainTranslation();
  const labels = useMemo(() => getMuscleHeatMapLabels(language), [language]);
  return (
    <section
      className="rounded-[18px] border border-border/70 bg-card p-4 shadow-sm"
      aria-labelledby="session-history-muscle-title"
      data-session-history-muscle-summary
      data-history-muscle-analysis-kind={analysisKind}
    >
      <h2 id="session-history-muscle-title" className="text-base font-semibold text-foreground">
        {tr("historyMuscleSummary")}
      </h2>
      {state === "loading" ? (
        <div
          className="mx-auto mt-3 h-[140px] max-w-[220px] animate-pulse rounded-2xl bg-muted motion-reduce:animate-none"
          aria-label={tr("historyDetailLoading")}
        />
      ) : (
        <MuscleHeatMap
          mode="compact"
          view="both"
          state={state}
          analysis={analysis}
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

function LiveSessionHistoryMuscleSummary({ sessionId }: { sessionId: string }) {
  const controller = useActiveWorkoutMuscleLoad({
    sessionId,
    refreshRevision: 0,
    mode: "completed",
  });
  if (["empty", "unavailable", "error"].includes(controller.state)) return null;
  const state = controller.state === "loading"
    ? "loading"
    : controller.state === "partial"
      ? "partial"
      : "ready";
  return (
    <SessionHistoryMuscleFrame
      state={state}
      analysis={controller.analysis}
      analysisKind="live"
    />
  );
}

function QaSessionHistoryMuscleSummary() {
  const [scenario, setScenario] = useState<string | null>(null);
  useEffect(() => {
    setScenario(window.localStorage.getItem(QA_SCENARIO_KEY));
  }, []);
  if (scenario === null) {
    return (
      <SessionHistoryMuscleFrame
        state="loading"
        analysis={null}
        analysisKind="v2-advanced"
      />
    );
  }
  const v1 = scenario === "v1-muscle-snapshot";
  return (
    <SessionHistoryMuscleFrame
      state="ready"
      analysis={v1 ? qaBroadAnalysis : qaAdvancedAnalysis}
      analysisKind={v1 ? "v1-broad" : "v2-advanced"}
    />
  );
}

export function SessionHistoryMuscleSummary({ sessionId }: { sessionId: string }) {
  if (env.useMockAuth) {
    return env.productionQaBuild ? <QaSessionHistoryMuscleSummary /> : null;
  }
  return <LiveSessionHistoryMuscleSummary sessionId={sessionId} />;
}
