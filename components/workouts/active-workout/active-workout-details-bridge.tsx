"use client";

import type { RefObject } from "react";

import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { WorkoutAiActionPanel } from "@/components/ai/workout-ai-action-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExercisePickerDialog } from "@/components/workouts/exercise-picker-dialog";
import type {
  ActiveWorkoutFormatters,
  ActiveWorkoutTranslator
} from "@/lib/i18n/active-workout";
import { isolateBidiText } from "@/lib/i18n/active-workout";
import {
  canUpdateWorkoutSetNote,
  validateWorkoutSetEffortInput,
  WORKOUT_SET_NOTE_MAX_CODE_POINTS,
  workoutSetNoteCodePointLength
} from "@/services/database/workout-set-details";
import type {
  ExerciseAlternativeReason,
  UserExerciseAlternative,
  Workout
} from "@/types";

import type {
  ActiveWorkoutExerciseState,
  ActiveWorkoutSetState
} from "./active-workout-runtime-model";

export type ActiveWorkoutDetailsBridgeProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  sourceKind: "plan-day" | "direct";
  activeExercise: ActiveWorkoutExerciseState;
  activeSet: ActiveWorkoutSetState;
  currentInstructions: string;
  currentGuideUrl: string | null;
  currentCustomVideoUrl: string | null;
  busy: boolean;
  tr: ActiveWorkoutTranslator;
  formatters: ActiveWorkoutFormatters;
  legacyReopenSetLabel: string;
  onApplyPreviousSet: () => void;
  onRestartSet: () => void;
  onUpdateSet: (patch: Partial<ActiveWorkoutSetState>) => void;
  activeAlternatives: UserExerciseAlternative[];
  replacementReason: ExerciseAlternativeReason;
  onReplacementReasonChange: (reason: ExerciseAlternativeReason) => void;
  onUseReplacement: () => void;
  onSkipExercise: () => void;
  isSavingAlternative: boolean;
  workoutContext: Record<string, unknown>;
  onResetTimer: () => void;
  sessionSourceId: string;
  replacementPickerOpen: boolean;
  onReplacementPickerOpenChange: (open: boolean) => void;
  dayName: string;
  onAddReplacement: (replacement: Workout) => void;
};

export function ActiveWorkoutDetailsBridge({
  open,
  onOpenChange,
  returnFocusRef,
  sourceKind,
  activeExercise,
  activeSet,
  currentInstructions,
  currentGuideUrl,
  currentCustomVideoUrl,
  busy,
  tr,
  formatters,
  legacyReopenSetLabel,
  onApplyPreviousSet,
  onRestartSet,
  onUpdateSet,
  activeAlternatives,
  replacementReason,
  onReplacementReasonChange,
  onUseReplacement,
  onSkipExercise,
  isSavingAlternative,
  workoutContext,
  onResetTimer,
  sessionSourceId,
  replacementPickerOpen,
  onReplacementPickerOpenChange,
  dayName,
  onAddReplacement
}: ActiveWorkoutDetailsBridgeProps) {
  const activeRpeValidation = validateWorkoutSetEffortInput(activeSet.rpe, "rpe");
  const activeRirValidation = validateWorkoutSetEffortInput(activeSet.rir, "rir");
  const rpeErrorId = activeRpeValidation.error ? "active-set-rpe-error" : undefined;
  const rirErrorId = activeRirValidation.error ? "active-set-rir-error" : undefined;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-active-set-details-dialog
          layout="responsive-drawer"
          closeLabel={tr("common.close")}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          className="max-h-[88dvh] overflow-y-auto p-5 lg:inset-y-6 lg:left-auto lg:right-6 lg:h-auto lg:w-[420px] lg:max-w-[420px] lg:translate-x-0 lg:translate-y-0 lg:rounded-[28px] lg:border"
        >
          <DialogHeader>
            <DialogTitle>{tr("actions.setDetails")}</DialogTitle>
            <DialogDescription>
              <bdi dir="auto">{currentInstructions}</bdi>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <section className="border-b border-border/70 pb-4">
              <h3 className="text-sm font-semibold">{tr("details.exerciseGuideVideo")}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentGuideUrl ? (
                  <Button asChild variant="outline">
                    <a href={currentGuideUrl} target="_blank" rel="noreferrer">
                      {tr("details.openExerciseGuide")}
                    </a>
                  </Button>
                ) : null}
                {currentCustomVideoUrl ? (
                  <Button asChild variant="outline">
                    <a href={currentCustomVideoUrl} target="_blank" rel="noreferrer">
                      {tr("details.openCustomVideo")}
                    </a>
                  </Button>
                ) : null}
                {!currentGuideUrl && !currentCustomVideoUrl ? (
                  <p className="text-xs text-muted-foreground">{tr("details.noneSaved")}</p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={onApplyPreviousSet}
                  disabled={Boolean(activeSet.completedAt) || busy}
                >
                  {tr("exercise.previousSet")}
                </Button>
                {activeSet.completedAt ? (
                  <Button type="button" variant="outline" onClick={onRestartSet} disabled={busy}>
                    {legacyReopenSetLabel}
                  </Button>
                ) : null}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold">{tr("details.advancedDetails")}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="active-set-rpe">{tr("set.rpe")}</Label>
                  <Input
                    id="active-set-rpe"
                    dir="ltr"
                    type="text"
                    inputMode="decimal"
                    value={activeSet.rpe}
                    onChange={(event) => onUpdateSet({ rpe: event.target.value })}
                    aria-invalid={Boolean(activeRpeValidation.error)}
                    aria-describedby={rpeErrorId}
                    disabled={busy}
                  />
                  {activeRpeValidation.error ? (
                    <p id="active-set-rpe-error" role="alert" className="text-xs text-destructive">
                      {tr("set.rpeInvalid")}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="active-set-rir">{tr("set.rir")}</Label>
                  <Input
                    id="active-set-rir"
                    dir="ltr"
                    type="text"
                    inputMode="decimal"
                    value={activeSet.rir}
                    onChange={(event) => onUpdateSet({ rir: event.target.value })}
                    aria-invalid={Boolean(activeRirValidation.error)}
                    aria-describedby={rirErrorId}
                    disabled={busy}
                  />
                  {activeRirValidation.error ? (
                    <p id="active-set-rir-error" role="alert" className="text-xs text-destructive">
                      {tr("set.rirInvalid")}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="active-set-type">{tr("set.type")}</Label>
                  <select
                    id="active-set-type"
                    value={activeSet.setType}
                    onChange={(event) => onUpdateSet({
                      setType: event.target.value as ActiveWorkoutSetState["setType"]
                    })}
                    className="flex h-12 w-full rounded-[14px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                  >
                    <option value="normal">{tr("set.normal")}</option>
                    <option value="warmup">{tr("set.warmup")}</option>
                    <option value="working">{tr("set.working")}</option>
                    <option value="failure">{tr("set.failure")}</option>
                    <option value="drop">{tr("set.drop")}</option>
                    <option value="backoff">{tr("set.backoff")}</option>
                    <option value="amrap">{tr("set.amrap")}</option>
                    <option value="timed">{tr("set.timed")}</option>
                    <option value="other">{tr("set.other")}</option>
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="active-set-note">{tr("set.note")}</Label>
                    <span
                      id="active-set-note-limit"
                      dir="ltr"
                      className="text-[10px] tabular-nums text-muted-foreground"
                    >
                      {formatters.ratio(
                        workoutSetNoteCodePointLength(activeSet.notes),
                        WORKOUT_SET_NOTE_MAX_CODE_POINTS
                      )}
                    </span>
                  </div>
                  <textarea
                    id="active-set-note"
                    aria-describedby="active-set-note-limit"
                    dir="auto"
                    className="min-h-24 w-full resize-y rounded-[14px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={activeSet.notes}
                    disabled={busy}
                    onChange={(event) => {
                      if (canUpdateWorkoutSetNote(activeSet.notes, event.target.value)) {
                        onUpdateSet({ notes: event.target.value });
                      }
                    }}
                    placeholder={tr("common.optional")}
                  />
                </div>
              </div>
            </section>

            {sourceKind === "plan-day" ? (
              <section className="border-t border-border/70 pt-4">
                <h3 className="text-sm font-semibold">{tr("actions.replaceToday")}</h3>
                {activeAlternatives.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tr("actions.savedAlternatives", {
                      names: activeAlternatives
                        .map((alternative) => isolateBidiText(alternative.alternative_exercise_name))
                        .join(", ")
                    })}
                  </p>
                ) : null}
                <select
                  value={replacementReason}
                  onChange={(event) => onReplacementReasonChange(
                    event.target.value as ExerciseAlternativeReason
                  )}
                  className="mt-3 h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm"
                >
                  <option value="machine_taken">{tr("actions.machineOccupied")}</option>
                  <option value="no_equipment">{tr("actions.equipmentUnavailable")}</option>
                  <option value="pain_or_discomfort">{tr("actions.painDiscomfort")}</option>
                  <option value="too_hard">{tr("actions.tooHardToday")}</option>
                  <option value="other">{tr("actions.other")}</option>
                </select>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" onClick={onUseReplacement} disabled={isSavingAlternative}>
                    {tr("actions.useToday")}
                  </Button>
                  <Button type="button" variant="outline" onClick={onSkipExercise} disabled={busy}>
                    {tr("actions.skipExerciseToday")}
                  </Button>
                  <AiActionRequestDialog
                    actions={[{
                      type: "replace_exercise",
                      label: tr("chatGPT.ask"),
                      description: tr("chatGPT.replaceDescription")
                    }]}
                    sourceType="plan_exercise"
                    sourceId={activeExercise.exercise.id}
                    context={{
                      ...workoutContext,
                      replacement_reason: replacementReason,
                      exercise_alternatives: activeAlternatives
                    }}
                  />
                </div>
              </section>
            ) : null}

            <section className="border-t border-border/70 pt-4">
              <h3 className="text-sm font-semibold">{tr("actions.timerControls")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {tr("actions.timerControlsDescription")}
              </p>
              <Button type="button" variant="outline" className="mt-3" onClick={onResetTimer} disabled={busy}>
                {tr("common.reset")}
              </Button>
            </section>

            <section className="border-t border-border/70 pt-4">
              <WorkoutAiActionPanel
                compact
                sourceType="workout_session"
                sourceId={sessionSourceId}
                context={workoutContext}
              />
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {sourceKind === "plan-day" ? (
        <ExercisePickerDialog
          open={replacementPickerOpen}
          onOpenChange={onReplacementPickerOpenChange}
          dayName={dayName}
          existingKeys={[]}
          maxSelection={1}
          onAdd={(replacements) => {
            const replacement = replacements[0];
            if (replacement) onAddReplacement(replacement);
          }}
        />
      ) : null}
    </>
  );
}
