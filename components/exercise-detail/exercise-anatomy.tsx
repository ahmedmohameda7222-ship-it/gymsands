"use client";

import { useMemo } from "react";
import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import type { ExerciseDetailViewModel } from "@/lib/exercise-detail/contracts";
import { projectAuthoritativeExercisePreview } from "@/lib/exercise-detail/anatomy";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";
import { calculateExerciseAdvancedMusclePreview, type PlanMuscleExerciseLike } from "@/lib/train/muscle-intelligence/plan-advanced-analysis";

export function exerciseAnatomyAnalysis(exercise: ExerciseDetailViewModel) {
  const v2 = projectAuthoritativeExercisePreview(exercise);
  if (v2) return v2;
  if (exercise.identity.source !== "catalog_legacy") return null;
  const identity: PlanMuscleExerciseLike = {
    id: exercise.identity.activityId,
    canonicalExerciseId: exercise.identity.activityId,
    sourceWorkoutId: exercise.identity.activityId,
    name: exercise.name,
    exercise_name: exercise.name
  };
  return calculateExerciseAdvancedMusclePreview(identity);
}

export function ExerciseAnatomyVisualization({ exercise, compact = false }: { exercise: ExerciseDetailViewModel; compact?: boolean }) {
  const { language } = useExerciseDetailTranslation();
  const labels = useMemo(() => getMuscleHeatMapLabels(language), [language]);
  const analysis = useMemo(() => exerciseAnatomyAnalysis(exercise), [exercise]);
  if (!analysis) return null;
  return <MuscleHeatMap
    mode={compact ? "compact" : "interactive"}
    view="both"
    state="ready"
    analysis={analysis}
    labels={labels}
    showLegend={!compact}
    showViewLabels={!compact}
    showStateMessage={false}
  />;
}
