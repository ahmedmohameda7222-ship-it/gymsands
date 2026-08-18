"use client";

import { Check, Circle, SkipForward } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ActiveWorkoutTranslator } from "@/lib/i18n/active-workout";

export type ActiveWorkoutExerciseNavigatorRow = {
  exerciseIndex: number;
  name: string;
  completedSets: number;
  totalSets: number;
  current: boolean;
  skipped: boolean;
  replacedFrom?: string | null;
  targetSetIndex: number;
};

export function ActiveWorkoutExerciseNavigator({
  open,
  onOpenChange,
  rows,
  readOnly,
  paused,
  busy,
  onSelect,
  tr,
  formatInteger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: readonly ActiveWorkoutExerciseNavigatorRow[];
  readOnly: boolean;
  paused: boolean;
  busy: boolean;
  onSelect: (exerciseIndex: number, setIndex: number) => void;
  tr: ActiveWorkoutTranslator;
  formatInteger: (value: number) => string;
}) {
  const mutationDisabled = readOnly || paused || busy;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-aw-exercise-navigator
        layout="responsive-drawer"
        closeLabel={tr("common.close")}
        className="max-h-[88dvh] overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="border-b border-border/70 p-5 pe-16">
          <DialogTitle>{tr("navigator.title")}</DialogTitle>
          <DialogDescription>
            {paused ? tr("navigator.pausedDescription") : readOnly ? tr("navigator.readOnlyDescription") : tr("navigator.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-4">
          <ol className="divide-y divide-border/70">
            {rows.map((row) => {
              const complete = row.totalSets > 0 && row.completedSets === row.totalSets;
              return (
                <li key={row.exerciseIndex}>
                  <button
                    type="button"
                    aria-current={row.current ? "step" : undefined}
                    disabled={mutationDisabled || row.skipped}
                    onClick={() => onSelect(row.exerciseIndex, row.targetSetIndex)}
                    className={cn(
                      "flex min-h-[60px] w-full items-center gap-3 px-2 py-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-65",
                      row.current && "bg-primary/8",
                      !mutationDisabled && !row.skipped && "hover:bg-muted/55",
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold" aria-hidden="true">
                      {row.skipped ? <SkipForward className="h-4 w-4" /> : complete ? <Check className="h-4 w-4" /> : row.current ? <Circle className="h-3.5 w-3.5 fill-current" /> : formatInteger(row.exerciseIndex + 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug text-foreground"><bdi>{row.name}</bdi></span>
                      {row.replacedFrom ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {tr("navigator.replacedFrom", { name: row.replacedFrom })}
                        </span>
                      ) : null}
                    </span>
                    <span dir="ltr" className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatInteger(row.completedSets)}/{formatInteger(row.totalSets)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function buildActiveWorkoutExerciseNavigatorRows(input: {
  exercises: ReadonlyArray<{
    exercise: { exercise_name: string };
    prescriptionItem: { executionState: string; sourcePlanExerciseId?: string | null };
    sets: ReadonlyArray<{ completedAt: string | null }>;
  }>;
  activeExerciseIndex: number;
  originalNamesByPlanExerciseId?: ReadonlyMap<string, string>;
}): ActiveWorkoutExerciseNavigatorRow[] {
  return input.exercises.map((exercise, exerciseIndex) => {
    const completedSets = exercise.sets.filter((set) => Boolean(set.completedAt)).length;
    const firstIncomplete = exercise.sets.findIndex((set) => !set.completedAt);
    const sourcePlanExerciseId = exercise.prescriptionItem.sourcePlanExerciseId ?? null;
    const originalName = sourcePlanExerciseId ? input.originalNamesByPlanExerciseId?.get(sourcePlanExerciseId) ?? null : null;
    const currentName = exercise.exercise.exercise_name;
    return {
      exerciseIndex,
      name: currentName,
      completedSets,
      totalSets: exercise.sets.length,
      current: exerciseIndex === input.activeExerciseIndex,
      skipped: exercise.prescriptionItem.executionState === "skipped",
      replacedFrom: originalName && originalName !== currentName ? originalName : null,
      targetSetIndex: firstIncomplete >= 0 ? firstIncomplete : Math.max(0, exercise.sets.length - 1),
    };
  });
}
