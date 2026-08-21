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
    className={compact ? "" : "[&>div:first-child]:grid-cols-2"}
  />;
}

export function ExerciseAnatomyRoleList({ exercise, compact = false }: { exercise: ExerciseDetailViewModel; compact?: boolean }) {
  const { ed } = useExerciseDetailTranslation();
  const roles = [
    { key: "primary", label: ed("primary"), values: exercise.target.primary, dot: "bg-amber-500" },
    { key: "secondary", label: ed("secondary"), values: exercise.target.secondary, dot: "bg-teal-500" },
    { key: "stabilizer", label: ed("stabilizers"), values: exercise.target.stabilizer, dot: "bg-sky-400" },
  ].filter((role) => role.values.length);
  if (!roles.length && exercise.target.focus.length) {
    roles.push({ key: "focus", label: ed("focus"), values: exercise.target.focus, dot: "bg-slate-400" });
  }
  return <div className={compact ? "space-y-2.5" : "space-y-3.5"} aria-label={ed("target")}>
    {roles.map((role) => <section key={role.key} className={compact ? "" : "rounded-2xl border border-border/65 bg-muted/20 p-4"}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={`size-2.5 shrink-0 rounded-full ${role.dot}`} aria-hidden="true" />{role.label}</h3>
      <p className={compact ? "mt-1 text-sm leading-5 text-muted-foreground" : "mt-2 text-[15px] leading-6 text-muted-foreground"}>{role.values.join(", ")}</p>
    </section>)}
  </div>;
}
