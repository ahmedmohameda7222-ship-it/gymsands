"use client";

import { useEffect, useRef, type RefObject } from "react";

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
import type { ActiveWorkoutDetailsSection } from "@/components/workouts/active-workout/active-workout-actions";
import type { ActiveWorkoutMuscleLoadController } from "@/components/workouts/active-workout/active-workout-muscle-load-controller";
import { ActiveWorkoutMuscleLoadSection } from "@/components/workouts/active-workout/active-workout-muscle-load-section";
import { ExercisePickerDialog } from "@/components/workouts/exercise-picker-dialog";
import {
  isolateBidiText,
  type ActiveWorkoutFormatters,
  type ActiveWorkoutTranslator
} from "@/lib/i18n/active-workout";
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
  ActiveWorkoutPreviousPerformance,
  ActiveWorkoutSetState
} from "./active-workout-runtime-model";

export type ActiveWorkoutDetailsFocusTarget = "guide-video" | null;

export type ActiveWorkoutDetailsBridgeProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  requestedSection: ActiveWorkoutDetailsSection;
  requestedFocusTarget: ActiveWorkoutDetailsFocusTarget;
  sourceKind: "plan-day" | "direct";
  activeExercise: ActiveWorkoutExerciseState;
  activeSet: ActiveWorkoutSetState;
  previousPerformance: ActiveWorkoutPreviousPerformance | null;
  currentInstructions: string;
  currentGuideUrl: string | null;
  currentCustomVideoUrl: string | null;
  busy: boolean;
  tr: ActiveWorkoutTranslator;
  formatters: ActiveWorkoutFormatters;
  /** @deprecated Reopen belongs to Review, not Set Details. */
  legacyReopenSetLabel: string;
  onApplyPreviousSet: () => void;
  /** @deprecated Reopen belongs to Review, not Set Details. */
  onRestartSet: () => void;
  onUpdateSet: (patch: Partial<ActiveWorkoutSetState>) => void;
  muscleLoadController: ActiveWorkoutMuscleLoadController;
  activeAlternatives: UserExerciseAlternative[];
  replacementReason: ExerciseAlternativeReason;
  onReplacementReasonChange: (reason: ExerciseAlternativeReason) => void;
  onUseReplacement: () => void;
  onSkipExercise: () => void;
  isSavingAlternative: boolean;
  workoutContext: Record<string, unknown>;
  /** @deprecated Timer reset is not a Set Details field. */
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
  requestedSection,
  requestedFocusTarget,
  sourceKind,
  activeExercise,
  activeSet,
  previousPerformance,
  currentInstructions,
  currentGuideUrl,
  currentCustomVideoUrl,
  busy,
  tr,
  formatters,
  onApplyPreviousSet,
  onUpdateSet,
  muscleLoadController,
  activeAlternatives,
  replacementReason,
  onReplacementReasonChange,
  onUseReplacement,
  onSkipExercise,
  isSavingAlternative,
  workoutContext,
  sessionSourceId,
  replacementPickerOpen,
  onReplacementPickerOpenChange,
  dayName,
  onAddReplacement
}: ActiveWorkoutDetailsBridgeProps) {
  const overviewRef = useRef<HTMLHeadingElement>(null);
  const currentSetRef = useRef<HTMLHeadingElement>(null);
  const muscleLoadRef = useRef<HTMLHeadingElement>(null);
  const adjustTodayRef = useRef<HTMLHeadingElement>(null);
  const assistanceRef = useRef<HTMLHeadingElement>(null);
  const guideGroupRef = useRef<HTMLDivElement>(null);
  const activeRpeValidation = validateWorkoutSetEffortInput(activeSet.rpe, "rpe");
  const activeRirValidation = validateWorkoutSetEffortInput(activeSet.rir, "rir");
  const rpeErrorId = activeRpeValidation.error ? "active-set-rpe-error" : undefined;
  const rirErrorId = activeRirValidation.error ? "active-set-rir-error" : undefined;

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const sectionRefs: Record<ActiveWorkoutDetailsSection, RefObject<HTMLHeadingElement | null>> = {
        overview: overviewRef,
        "current-set": currentSetRef,
        "muscle-load": muscleLoadRef,
        "adjust-today": adjustTodayRef,
        assistance: assistanceRef
      };
      const requested = sectionRefs[effectiveSection].current;
      const focusTarget = requestedFocusTarget === "guide-video"
        ? guideGroupRef.current
        : requested;
      requested?.scrollIntoView({ block: "start" });
      focusTarget?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [effectiveSection, open, requestedFocusTarget]);

  const closeBeforeAi = () => onOpenChange(false);
  const effectiveSection: ActiveWorkoutDetailsSection =
    requestedSection === "adjust-today" && sourceKind !== "plan-day" ? "overview" : requestedSection;
  const dialogTitle = effectiveSection === "overview"
    ? tr("details.exerciseOverview")
    : effectiveSection === "current-set"
      ? tr("actions.setDetails")
      : effectiveSection === "muscle-load"
        ? tr("details.muscleLoad")
        : effectiveSection === "adjust-today"
          ? tr("details.adjustToday")
          : tr("chatGPT.ask");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-active-set-details-dialog
          data-aw6-details-section={requestedSection}
          layout="responsive-drawer"
          closeLabel={tr("common.close")}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          className="max-h-[92dvh] overflow-hidden p-0 lg:inset-y-6 lg:left-auto lg:right-6 lg:h-[calc(100dvh-3rem)] lg:max-h-[calc(100dvh-3rem)] lg:w-[440px] lg:max-w-[440px] lg:translate-x-0 lg:translate-y-0 lg:rounded-[28px] lg:border lg:rtl:left-6 lg:rtl:right-auto"
        >
          <DialogHeader className="mb-0 shrink-0 border-b border-border/70 p-5 pe-16">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{tr("details.activeWorkoutDetailsDescription")}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            <div className="divide-y divide-border/70">
              <section
                data-aw6-details-overview
                hidden={effectiveSection !== "overview"}
                aria-labelledby="aw6-details-overview-title"
                className="scroll-mt-4 py-5"
              >
                <h3
                  id="aw6-details-overview-title"
                  ref={overviewRef}
                  tabIndex={-1}
                  className="text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tr("details.exerciseOverview")}
                </h3>
                <p className="mt-2 text-lg font-semibold"><bdi>{activeExercise.exercise.exercise_name}</bdi></p>
                {currentInstructions.trim() ? (
                  <div className="mt-4">
                    <p className="text-sm font-semibold">{tr("details.instructions")}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      <bdi dir="auto">{currentInstructions}</bdi>
                    </p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <p className="text-sm font-semibold">{tr("exercise.previousPerformance")}</p>
                  {previousPerformance ? (
                    <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                      {previousPerformance.lastBestSet ? (
                        <p>{previousPerformance.lastBestSet}</p>
                      ) : null}
                      {previousPerformance.lastPerformedAt ? (
                        <p>{tr("details.previousDate", {
                          date: formatters.date(previousPerformance.lastPerformedAt)
                        })}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tr("exercise.noPreviousPerformance")}
                    </p>
                  )}
                  {previousPerformance ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 min-h-11"
                      onClick={onApplyPreviousSet}
                      disabled={Boolean(activeSet.completedAt) || busy}
                    >
                      {tr("exercise.useValues")}
                    </Button>
                  ) : null}
                </div>

                <div
                  ref={guideGroupRef}
                  tabIndex={-1}
                  className="mt-4 rounded-[var(--radius-md)] bg-muted/30 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="text-sm font-semibold">{tr("details.exerciseGuideVideo")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentGuideUrl ? (
                      <Button asChild variant="outline" size="sm" className="min-h-11">
                        <a href={currentGuideUrl} target="_blank" rel="noreferrer noopener">
                          {tr("details.openExerciseGuide")}
                        </a>
                      </Button>
                    ) : null}
                    {currentCustomVideoUrl ? (
                      <Button asChild variant="outline" size="sm" className="min-h-11">
                        <a href={currentCustomVideoUrl} target="_blank" rel="noreferrer noopener">
                          {tr("details.openCustomVideo")}
                        </a>
                      </Button>
                    ) : null}
                    {!currentGuideUrl && !currentCustomVideoUrl ? (
                      <p className="text-xs text-muted-foreground">{tr("details.noneSaved")}</p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section
                data-aw6-details-current-set
                hidden={effectiveSection !== "current-set"}
                data-aw10-set-details-exact
                aria-labelledby="aw6-details-current-set-title"
                className="scroll-mt-4 py-5"
              >
                <h3
                  id="aw6-details-current-set-title"
                  ref={currentSetRef}
                  tabIndex={-1}
                  className="text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tr("details.currentSet")}
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

              <section
                data-aw6-details-muscle-load
                hidden={effectiveSection !== "muscle-load"}
                aria-labelledby="aw6-details-muscle-load-title"
                className="scroll-mt-4 py-5"
              >
                <h3
                  id="aw6-details-muscle-load-title"
                  ref={muscleLoadRef}
                  tabIndex={-1}
                  className="text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tr("details.muscleLoad")}
                </h3>
                <div className="mt-3">
                  <ActiveWorkoutMuscleLoadSection controller={muscleLoadController} />
                </div>
              </section>

              {sourceKind === "plan-day" ? (
                <section
                  data-aw6-details-adjust-today
                hidden={effectiveSection !== "adjust-today"}
                  aria-labelledby="aw6-details-adjust-today-title"
                  className="scroll-mt-4 py-5"
                >
                  <h3
                    id="aw6-details-adjust-today-title"
                    ref={adjustTodayRef}
                    tabIndex={-1}
                    className="text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {tr("details.adjustToday")}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {tr("actions.replaceTodayDescription")}
                  </p>
                  {activeAlternatives.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {tr("actions.savedAlternatives", {
                        names: activeAlternatives
                          .map((alternative) => isolateBidiText(alternative.alternative_exercise_name))
                          .join(", ")
                      })}
                    </p>
                  ) : null}
                  <Label htmlFor="active-workout-replacement-reason" className="mt-4 block">
                    {tr("actions.chooseReason")}
                  </Label>
                  <select
                    id="active-workout-replacement-reason"
                    value={replacementReason}
                    onChange={(event) => onReplacementReasonChange(
                      event.target.value as ExerciseAlternativeReason
                    )}
                    className="mt-1.5 h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                  >
                    <option value="machine_taken">{tr("actions.machineOccupied")}</option>
                    <option value="no_equipment">{tr("actions.equipmentUnavailable")}</option>
                    <option value="pain_or_discomfort">{tr("actions.painDiscomfort")}</option>
                    <option value="too_hard">{tr("actions.tooHardToday")}</option>
                    <option value="other">{tr("actions.other")}</option>
                  </select>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={onUseReplacement}
                      disabled={isSavingAlternative || busy}
                    >
                      {tr("actions.chooseReplacement")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-amber-500/40 text-foreground hover:bg-amber-500/10"
                      onClick={onSkipExercise}
                      disabled={busy}
                    >
                      {tr("actions.skipExerciseToday")}
                    </Button>
                  </div>
                  <AiActionRequestDialog
                    className="mt-3"
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
                    onBeforeOpen={closeBeforeAi}
                  />
                </section>
              ) : null}

              <section
                data-aw6-details-assistance
                hidden={effectiveSection !== "assistance"}
                aria-labelledby="aw6-details-assistance-title"
                className="scroll-mt-4 py-5"
              >
                <h3
                  id="aw6-details-assistance-title"
                  ref={assistanceRef}
                  tabIndex={-1}
                  className="text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tr("chatGPT.ask")}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tr("chatGPT.actionsDescription")}
                </p>
                <div className="mt-3">
                  <WorkoutAiActionPanel
                    compact
                    sourceType="workout_session"
                    sourceId={sessionSourceId}
                    context={workoutContext}
                    onBeforeOpen={closeBeforeAi}
                  />
                </div>
              </section>
            </div>
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
