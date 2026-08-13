"use client";

import { CircleDashed, ChevronDown } from "lucide-react";

import { SetHistoryRow } from "@/components/workouts/history/set-history-row";
import { useTrainTranslation } from "@/lib/i18n/train";
import { presentWorkoutMetric, workoutSegmentLabel } from "@/lib/workouts/metric-presentation";
import type { WorkoutHistoryExerciseDetail } from "@/types/workout-history";

export function ExerciseHistorySection({ exercise, defaultOpen }: { exercise: WorkoutHistoryExerciseDetail; defaultOpen: boolean }) {
  const { locale, tr } = useTrainTranslation();
  const semantic = exercise.resultKind === "semantic_metrics";
  const description = semantic
    ? tr("historyResultsCount", { count: exercise.performedSets.length })
    : exercise.plannedSetCount === null
      ? exercise.performedSets.length ? tr("historySavedSetsHighlight", { count: exercise.performedSets.length }) : tr("historyNoPerformedSets")
      : tr("historyPlannedPerformed", { completed: exercise.performedSets.length, planned: exercise.plannedSetCount });

  return (
    <details open={defaultOpen} className="group py-4" data-exercise-history-section>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0"><span className="block font-semibold text-foreground">{exercise.name}{exercise.state === "replaced" && exercise.plannedName && exercise.plannedName !== exercise.name ? <span className="ms-2 text-xs font-normal text-muted-foreground">{tr("historyReplacedFrom", { name: exercise.plannedName })}</span> : null}</span><span className="mt-0.5 block text-xs text-muted-foreground">{description}</span></span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="mt-2 ps-1">
        {semantic ? exercise.performedSets.map((result) => {
          const facts = [
            ...result.metrics.map((metric) => presentWorkoutMetric(metric, locale)).filter((value): value is { label: string; value: string } => Boolean(value)),
            ...result.segments.flatMap((segment) => segment.metrics.map((metric) => {
              const presented = presentWorkoutMetric(metric, locale);
              const label = workoutSegmentLabel(segment.segmentKind, locale);
              return presented && label ? { label: `${label} · ${presented.label}`, value: presented.value } : null;
            }).filter((value): value is { label: string; value: string } => Boolean(value))),
          ];
          return <div key={result.id} className="border-b border-border/60 py-3 last:border-b-0"><p className="text-xs font-medium text-muted-foreground">{tr("historyResultNumber", { count: result.setNumber })}</p><dl className="mt-1 grid gap-2 sm:grid-cols-2">{facts.map((fact) => <div key={`${fact.label}:${fact.value}`}><dt className="text-xs text-muted-foreground">{fact.label}</dt><dd className="font-semibold text-foreground"><bdi dir="ltr">{fact.value}</bdi></dd></div>)}</dl>{!facts.length ? <p className="text-sm text-muted-foreground">{tr("historyNoMetric")}</p> : null}</div>;
        }) : exercise.performedSets.map((set) => <SetHistoryRow key={set.id} set={set} />)}
        {!semantic ? exercise.missingPlannedSets.map((set) => <div key={set.id} className="flex min-h-11 items-center gap-2 border-b border-dashed border-border px-1 text-sm text-muted-foreground" data-missing-planned-set><CircleDashed className="size-4" aria-hidden="true" /><span>{tr("historySetNumber", { count: set.setOrder })}: {tr("historyMissingPlannedSet")}</span></div>) : null}
        {!exercise.performedSets.length && !exercise.missingPlannedSets.length ? <p className="py-3 text-sm text-muted-foreground">{tr("historyNoPerformedSets")}</p> : null}
      </div>
    </details>
  );
}
