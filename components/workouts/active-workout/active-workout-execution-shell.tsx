"use client";

import type { ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Clock3,
  Ellipsis,
  FastForward,
  Plus
} from "lucide-react";

import {
  MobileStickyActions,
  MobileStickyActionsSpacer
} from "@/components/layout/mobile-sticky-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { ActiveWorkoutQuickAction } from "./active-workout-actions";
import type { ActiveWorkoutSetPathItem } from "./active-workout-ui-model";

export type ActiveWorkoutPrimaryActionKind =
  | "complete-set"
  | "skip-rest"
  | "resume"
  | "finish";

export type ActiveWorkoutExecutionShellProps = {
  direction: "ltr" | "rtl";
  sessionLabel: string;
  exerciseName: string;
  exercisePositionLabel: string;
  setPositionLabel: string;
  completedSetsLabel: string;
  elapsedLabel: string;
  progress: number;
  miniHeatMap: ReactNode;
  desktopMiniHeatMap: ReactNode;
  muscleLoadStatusLabel: string;
  mobileQuickActions: readonly ActiveWorkoutQuickAction[];
  desktopQuickActions: readonly ActiveWorkoutQuickAction[];
  paused: boolean;
  busy: boolean;
  restActive: boolean;
  restLabel: string;
  nextContextLabel: string;
  currentSetLabel: string;
  repsLabel: string;
  weightLabel: string;
  repsDraft: string;
  weightDraft: string;
  repsError: string | null;
  weightError: string | null;
  inputHint: string | null;
  setPathLabel: string;
  setPath: readonly ActiveWorkoutSetPathItem[];
  setPathStateLabels: Readonly<Record<ActiveWorkoutSetPathItem["state"], string>>;
  formatSetNumber: (value: number) => string;
  currentSetNumber: number;
  persisted: boolean;
  completed: boolean;
  hasDetails: boolean;
  primaryActionKind: ActiveWorkoutPrimaryActionKind;
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  moreLabel: string;
  pauseLabel: string;
  resumeLabel: string;
  finishLabel: string;
  addThirtySecondsLabel: string;
  restPresetSectionLabel: string;
  restPresetLabels: ReadonlyArray<{ seconds: number; label: string }>;
  feedback: ReactNode;
  detailsContent: ReactNode;
  completionContent?: ReactNode;
  onRepsChange: (value: string) => void;
  onWeightChange: (value: string) => void;
  onSelectSet: (setNumber: number) => void;
  onPrimaryAction: () => void;
  onPauseResume: () => void;
  onFinish: () => void;
  onOpenDetails: (trigger: HTMLButtonElement) => void;
  onQuickAction: (action: ActiveWorkoutQuickAction, trigger: HTMLButtonElement) => void;
  onAddThirtySeconds: () => void;
  onStartRest: (seconds: number) => void;
};

function PrimaryActionIcon({ kind }: { kind: ActiveWorkoutPrimaryActionKind }) {
  if (kind === "skip-rest") return <FastForward className="h-5 w-5" aria-hidden="true" />;
  if (kind === "resume") return <CirclePlay className="h-5 w-5" aria-hidden="true" />;
  return <CheckCircle2 className="h-5 w-5" aria-hidden="true" />;
}

export function ActiveWorkoutExecutionShell({
  direction,
  sessionLabel,
  exerciseName,
  exercisePositionLabel,
  setPositionLabel,
  completedSetsLabel,
  elapsedLabel,
  progress,
  miniHeatMap,
  desktopMiniHeatMap,
  muscleLoadStatusLabel,
  mobileQuickActions,
  desktopQuickActions,
  paused,
  busy,
  restActive,
  restLabel,
  nextContextLabel,
  currentSetLabel,
  repsLabel,
  weightLabel,
  repsDraft,
  weightDraft,
  repsError,
  weightError,
  inputHint,
  setPathLabel,
  setPath,
  setPathStateLabels,
  formatSetNumber,
  currentSetNumber,
  persisted,
  completed,
  hasDetails,
  primaryActionKind,
  primaryActionLabel,
  primaryActionDisabled,
  moreLabel,
  pauseLabel,
  resumeLabel,
  finishLabel,
  addThirtySecondsLabel,
  restPresetSectionLabel,
  restPresetLabels,
  feedback,
  detailsContent,
  completionContent,
  onRepsChange,
  onWeightChange,
  onSelectSet,
  onPrimaryAction,
  onPauseResume,
  onFinish,
  onOpenDetails,
  onQuickAction,
  onAddThirtySeconds,
  onStartRest
}: ActiveWorkoutExecutionShellProps) {
  const progressPercent = Math.round(progress * 100);
  const resolvedPrimaryActionDisabled = primaryActionKind === "complete-set"
    ? busy || completed
    : primaryActionDisabled;

  return (
    <div
      data-aw5-execution-shell
      data-aw5-session-state={paused ? "paused" : restActive ? "rest" : completed ? "completed" : "set-entry"}
      data-active-set-state
      data-active-set-number={currentSetNumber}
      data-active-set-persisted={persisted ? "true" : "false"}
      data-active-set-completed={completed ? "true" : "false"}
      data-active-set-has-details={hasDetails ? "true" : "false"}
      className="mx-auto w-full max-w-6xl lg:pb-6"
      dir={direction}
    >
      {completionContent}

      <header
        data-aw5-header
        className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background/95 py-3 pe-4 ps-[4.25rem] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:pe-6 sm:ps-[4.75rem] lg:static lg:mx-0 lg:rounded-[var(--radius-xl)] lg:border lg:bg-card/90 lg:px-5 lg:py-4"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1
              data-aw5-session-title
              className="truncate text-[15px] font-semibold leading-5 text-foreground"
            >
              <bdi>{sessionLabel}</bdi>
            </h1>
            <div
              data-aw5-metadata
              className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-muted-foreground"
            >
              <span>{exercisePositionLabel}</span>
              <span>{setPositionLabel}</span>
              <span dir="ltr" className="inline-flex items-center gap-1 tabular-nums">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                {elapsedLabel}
              </span>
              {restActive ? (
                <span dir="ltr" className="font-semibold tabular-nums text-primary">
                  {restLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div data-aw5-mini-heat-map-slot className="lg:hidden">{miniHeatMap}</div>
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div
              role="progressbar"
              aria-label={completedSetsLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {completedSetsLabel}
            </p>
          </div>
          <Button
            data-aw5-pause-resume
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-10 shrink-0"
            onClick={onPauseResume}
            disabled={busy}
            aria-label={paused ? resumeLabel : pauseLabel}
          >
            {paused
              ? <CirclePlay className="h-4 w-4" aria-hidden="true" />
              : <CirclePause className="h-4 w-4" aria-hidden="true" />}
            {paused ? resumeLabel : pauseLabel}
          </Button>
        </div>
      </header>

      <main className="mt-3 grid items-start gap-4 sm:mt-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-6">
        <section aria-labelledby="aw5-current-exercise" className="min-w-0">
          <div className="border-b border-border/70 pb-3 sm:pb-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary">{currentSetLabel}</p>
              <h2
                id="aw5-current-exercise"
                data-aw5-exercise-title
                className="mt-1 text-[clamp(1.45rem,5.8vw,2.25rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground"
              >
                <bdi>{exerciseName}</bdi>
              </h2>
            </div>
            <div
              data-aw6-mobile-quick-actions
              className="mt-3 grid grid-cols-3 gap-2 lg:hidden"
            >
              {mobileQuickActions.map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10 min-w-0 px-2 text-[11px]"
                  onClick={(event) => onQuickAction(action, event.currentTarget)}
                  disabled={action.disabled}
                >
                  <span className="truncate">{action.label}</span>
                </Button>
              ))}
              <Button
                data-active-set-details-trigger
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 min-w-0 px-2 text-[11px]"
                aria-label={moreLabel}
                onClick={(event) => onOpenDetails(event.currentTarget)}
              >
                <Ellipsis className="h-4 w-4" aria-hidden="true" />
                <span className="truncate">{moreLabel}</span>
              </Button>
            </div>
          </div>

          <div data-aw5-primary-editor className="mt-4 sm:mt-5">
            <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="active-set-reps" className="text-xs font-semibold text-muted-foreground">
                  {repsLabel}
                </Label>
                <Input
                  id="active-set-reps"
                  dir="ltr"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={repsDraft}
                  onChange={(event) => onRepsChange(event.target.value)}
                  disabled={busy}
                  aria-invalid={Boolean(repsError)}
                  aria-describedby={repsError ? "active-set-reps-error" : undefined}
                  className="h-14 text-center text-2xl font-semibold tabular-nums sm:h-[4.5rem] sm:text-3xl"
                  placeholder="0"
                />
                {repsError ? (
                  <p id="active-set-reps-error" role="alert" className="text-xs text-destructive">
                    {repsError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="active-set-weight" className="text-xs font-semibold text-muted-foreground">
                  {weightLabel}
                </Label>
                <Input
                  id="active-set-weight"
                  dir="ltr"
                  type="text"
                  inputMode="decimal"
                  value={weightDraft}
                  onChange={(event) => onWeightChange(event.target.value)}
                  disabled={busy}
                  aria-invalid={Boolean(weightError)}
                  aria-describedby={weightError ? "active-set-weight-error" : undefined}
                  className="h-14 text-center text-2xl font-semibold tabular-nums sm:h-[4.5rem] sm:text-3xl"
                  placeholder="0"
                />
                {weightError ? (
                  <p id="active-set-weight-error" role="alert" className="text-xs text-destructive">
                    {weightError}
                  </p>
                ) : null}
              </div>
            </div>
            {inputHint ? (
              <p className="mt-2 text-xs text-muted-foreground">{inputHint}</p>
            ) : null}
          </div>

          <div data-aw5-set-path className="mt-4 sm:mt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-muted-foreground">{setPathLabel}</h3>
              <span className="text-[11px] text-muted-foreground">{setPositionLabel}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {setPath.map((item) => (
                <button
                  key={item.number}
                  data-aw5-set-path-number={item.number}
                  type="button"
                  aria-current={item.state === "active" ? "step" : undefined}
                  aria-label={`${setPathLabel} ${formatSetNumber(item.number)}: ${setPathStateLabels[item.state]}`}
                  disabled={busy}
                  onClick={() => onSelectSet(item.number)}
                  className={cn(
                    "inline-flex h-10 min-w-10 items-center justify-center rounded-[var(--radius-sm)] border px-3 text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:h-11 sm:min-w-11",
                    item.state === "completed"
                      ? "border-success/35 bg-success/10 text-success"
                      : item.state === "active"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/45 hover:text-foreground"
                  )}
                >
                  {item.state === "completed" ? (
                    <>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{setPathStateLabels.completed}</span>
                    </>
                  ) : formatSetNumber(item.number)}
                </button>
              ))}
            </div>
          </div>

          {restActive ? (
            <div className="mt-4 border-t border-border/70 pt-4 sm:mt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{restLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{nextContextLabel}</p>
                </div>
                <Button
                  data-aw5-add-thirty
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden lg:inline-flex"
                  onClick={onAddThirtySeconds}
                  disabled={busy}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {addThirtySecondsLabel}
                </Button>
              </div>
            </div>
          ) : null}

          <div data-aw5-feedback aria-live="polite" className="mt-3 sm:mt-4">
            {feedback}
          </div>
        </section>

        <aside className="hidden lg:sticky lg:top-4 lg:block lg:rounded-[var(--radius-lg)] lg:border lg:border-border/70 lg:bg-card/75 lg:p-4">
          <div className="flex items-center gap-3 border-b border-border/70 pb-4">
            {desktopMiniHeatMap}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{muscleLoadStatusLabel}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{completedSetsLabel}</p>
            </div>
          </div>

          <Button
            data-aw5-primary-action
            type="button"
            className="mt-4 min-h-[52px] w-full text-[15px]"
            onClick={onPrimaryAction}
            disabled={resolvedPrimaryActionDisabled}
            aria-busy={busy}
          >
            <PrimaryActionIcon kind={primaryActionKind} />
            {primaryActionLabel}
          </Button>

          <div data-aw6-desktop-quick-actions className="mt-4 border-t border-border/70 pt-4">
            <h3 className="text-xs font-semibold text-muted-foreground">
              {moreLabel}
            </h3>
            <div className="mt-2 grid gap-2">
              {desktopQuickActions.map((action) => (
                <Button
                  key={action.id}
                  data-active-set-details-trigger={
                    action.id === "set-details" ? true : undefined
                  }
                  type="button"
                  variant={action.id === "skip-today" ? "outline" : "ghost"}
                  size="sm"
                  className={cn(
                    "min-h-10 w-full justify-start",
                    action.id === "skip-today" && "border-amber-500/40 hover:bg-amber-500/10"
                  )}
                  onClick={(event) => onQuickAction(action, event.currentTarget)}
                  disabled={action.disabled}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>

          {restActive ? (
            <div data-aw5-rest-presets className="mt-4 border-t border-border/70 pt-4">
              <h3 className="text-xs font-semibold text-muted-foreground">
                {restPresetSectionLabel}
              </h3>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {restPresetLabels.map((preset) => (
                  <Button
                    key={preset.seconds}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 px-1.5 text-xs"
                    onClick={() => onStartRest(preset.seconds)}
                    disabled={busy}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={onFinish}
            disabled={busy}
          >
            {finishLabel}
          </Button>
        </aside>
      </main>

      {detailsContent}

      <MobileStickyActions
        placement="session"
        data-aw5-sticky-actions
        className="z-[60]"
        aria-busy={busy}
      >
        <div className="mx-auto flex w-full max-w-xl items-center gap-2.5">
          {restActive ? (
            <Button
              data-aw5-add-thirty
              type="button"
              variant="outline"
              className="min-h-[52px] shrink-0 px-3 text-xs"
              onClick={onAddThirtySeconds}
              disabled={busy}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {addThirtySecondsLabel}
            </Button>
          ) : primaryActionKind === "complete-set" ? (
            <Button
              data-aw5-finish-action
              type="button"
              variant="outline"
              className="min-h-[52px] shrink-0 px-3 text-xs"
              onClick={onFinish}
              disabled={busy}
            >
              {finishLabel}
            </Button>
          ) : null}
          <Button
            data-aw5-primary-action
            type="button"
            className="min-h-[52px] flex-1 text-[15px]"
            onClick={onPrimaryAction}
            disabled={resolvedPrimaryActionDisabled}
            aria-busy={busy}
          >
            <PrimaryActionIcon kind={primaryActionKind} />
            {primaryActionLabel}
          </Button>
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer placement="session" />
    </div>
  );
}
