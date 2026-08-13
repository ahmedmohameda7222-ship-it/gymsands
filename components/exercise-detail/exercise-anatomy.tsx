"use client";

import { useMemo, useState } from "react";
import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ExerciseDetailViewModel } from "@/lib/exercise-detail/contracts";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { getMuscleHeatMapLabels } from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";
import { calculateExerciseAdvancedMusclePreview, type PlanMuscleExerciseLike } from "@/lib/train/muscle-intelligence/plan-advanced-analysis";

export function exerciseAnatomyAnalysis(exercise: ExerciseDetailViewModel) {
  const identity: PlanMuscleExerciseLike = {
    id: exercise.identity.activityId,
    canonicalExerciseId: exercise.identity.activityId,
    sourceWorkoutId: exercise.identity.activityId,
    name: exercise.name,
    exercise_name: exercise.name
  };
  return calculateExerciseAdvancedMusclePreview(identity);
}

export function ExerciseAnatomy({ exercise, analysis: providedAnalysis }: { exercise: ExerciseDetailViewModel; analysis?: ReturnType<typeof exerciseAnatomyAnalysis> }) {
  const { language, dir, ed } = useExerciseDetailTranslation();
  const [open, setOpen] = useState(false);
  const labels = useMemo(() => getMuscleHeatMapLabels(language), [language]);
  const analysis = useMemo(() => providedAnalysis ?? exerciseAnatomyAnalysis(exercise), [exercise, providedAnalysis]);
  if (!analysis) return null;
  return <><div className="space-y-3"><div className="pointer-events-none" aria-hidden="true"><MuscleHeatMap mode="compact" view="both" state="ready" analysis={analysis} labels={labels} showLegend={false} showViewLabels={false} showStateMessage={false} /></div><Button type="button" variant="outline" className="min-h-12 w-full" onClick={() => setOpen(true)}>{ed("muscleDetails")}</Button></div><Dialog open={open} onOpenChange={setOpen}><DialogContent dir={dir} closeLabel={ed("close")} layout="responsive-drawer"><div className="overflow-y-auto p-4 sm:p-6"><DialogHeader><DialogTitle>{ed("anatomyTitle")}</DialogTitle></DialogHeader><MuscleHeatMap mode="interactive" view="both" state="ready" analysis={analysis} labels={labels} /></div></DialogContent></Dialog></>;
}
