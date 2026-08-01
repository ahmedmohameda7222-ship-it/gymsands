"use client";

import { CircleDashed } from "lucide-react";

import { Disclosure } from "@/components/ui/disclosure";
import { SetHistoryRow } from "@/components/workouts/history/set-history-row";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryExerciseDetail } from "@/types/workout-history";

export function ExerciseHistorySection({ exercise, defaultOpen }: { exercise: WorkoutHistoryExerciseDetail; defaultOpen: boolean }) {
  const { tr } = useTrainTranslation();
  const description = exercise.plannedSetCount === null
    ? exercise.performedSets.length
      ? tr("historySavedSetsHighlight", { count: exercise.performedSets.length })
      : tr("historyNoPerformedSets")
    : tr("historyPlannedPerformed", { completed: exercise.performedSets.length, planned: exercise.plannedSetCount });

  return (
    <Disclosure
      defaultOpen={defaultOpen}
      className="overflow-hidden rounded-[18px]"
      title={<span>{exercise.name}{exercise.state === "replaced" && exercise.plannedName && exercise.plannedName !== exercise.name ? <span className="ms-2 text-xs font-normal text-muted-foreground">{tr("historyReplacedFrom", { name: exercise.plannedName })}</span> : null}</span>}
      description={description}
      toggleLabel={`${exercise.name}: ${description}`}
    >
      <div className="space-y-2">
        {exercise.performedSets.map((set) => <SetHistoryRow key={set.id} set={set} />)}
        {exercise.missingPlannedSets.map((set) => (
          <div key={set.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 text-sm text-muted-foreground" data-missing-planned-set>
            <CircleDashed className="size-4" aria-hidden="true" />
            <span>{tr("historySetNumber", { count: set.setOrder })}: {tr("historyMissingPlannedSet")}</span>
          </div>
        ))}
        {!exercise.performedSets.length && !exercise.missingPlannedSets.length ? (
          <p className="text-sm text-muted-foreground">{tr("historyNoPerformedSets")}</p>
        ) : null}
      </div>
    </Disclosure>
  );
}
