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
  PersonStanding,
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
  miniHeatMapLabel: string;
  miniHeatMapDescription: string;
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
  onAddThirtySeconds: () => void;
  onStartRest: (seconds: number) => void;
};

function PrimaryActionIcon({ kind }: { kind: ActiveWorkoutPrimaryActionKind }) {
  if (kind === "skip-rest") return <FastForward className="h-5 w-5" />;
  if (kind === "resume") return <CirclePlay className="h-5 w-5" />;
  return <CheckCircle2 className="h-5 w-5" />;
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
  miniHeatMapLabel,
  miniHeatMapDescription,
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
  onAddThirtySeconds,
  onStartRest
}: ActiveWorkoutExecutionShellProps) {
  const progressPercent = Math.round(progress * 100);

  return (
    <div
      data-aw5-execution-shell
      data-aw5-session-state={paused ? "paused" : restActive ? "rest" : completed ? "completed" : "set-entry"}
      data-active-set-state
      data-active-set-number={currentSetNumber}
      data-active-set-persisted={persisted ? "true" : "false"}
      data-active-set-completed={completed ? "true" : "false"}
      data-active-set-has-details={hasDetails ? "true" : "false"}
      className="mx-auto w-full max-w-6xl pb-28 lg:pb-6"
      dir={direction}
    >
      {completionContent}

      <header className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:static lg:mx-0 lg:rounded-[var(--radius-xl)] lg:border lg:bg-card/90 lg:px-5 lg:py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-5 text-foreground">
              <bdi>{sessionLabel}</bdi>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-muted-foreground">
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

          <div
            data-aw5-mini-heat-map-slot
            role="img"
            aria-label={miniHeatMapLabel}
            title={miniHeatMapDescription}
            className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border/70 bg-muted/35 text-muted-foreground lg:h-[68px] lg:w-[68px]"
          >
            <PersonStanding className="h-8 w-8" strokeWidth={1.6} aria-hidden="true" />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
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
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
              {completedSetsLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 shrink-0"
            onClick={onPauseResume}
            disabled={busy}
            aria-label={paused ? resumeLabel : pauseLabel}
          >
            {paused ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}
            {paused ? resumeLabel : pauseLabel}
          </Button>
        </div>
      </header>

      <main className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-6">
        <section aria-labelledby="aw5-current-exercise" className="min-w-0">
          <div className="flex items-start gap-3 border-b border-border/70 pb-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-primary">{currentSetLabel}</p>
              <h2
                id="aw5-current-exercise"
                className="mt-1 text-[clamp(1.55rem,5.8vw,2.25rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground"
              >
                <bdi>{exerciseName}</bdi>
              </h2>
            </div>
            <Button
              data-active-set-details-trigger
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0"
              aria-label={moreLabel}
              onClick={(event) => onOpenDetails(event.currentTarget)}
              disabled={busy}
            >
              <Ellipsis className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-xl">
            <div className="space-y-2">
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
                className="h-16 text-center text-2xl font-semibold tabular-nums sm:h-[4.5rem] sm:text-3xl"
                placeholder="0"
              />
              {repsError ? (
                <p id="active-set-reps-error" role="alert" className="text-xs text-destructive">
                  {repsError}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
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
                className="h-16 text-center text-2xl font-semibold tabular-nums sm:h-[4.5rem] sm:text-3xl"
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

          <div className="mt-5">
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
                    "inline-flex h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border px-3 text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
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
            <div className="mt-5 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{restLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{nextContextLabel}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onAddThirtySeconds} disabled={busy}>
                  <Plus className="h-4 w-4" />
                  {addThirtySecondsLabel}
                </Button>
              </div>
            </div>
          ) : null}

          <div aria-live="polite" className="mt-4">
            {feedback}
          </div>
        </section>

        <aside className="border-t border-border/70 pt-4 lg:sticky lg:top-4 lg:rounded-[var(--radius-lg)] lg:border lg:bg-card/75 lg:p-4">
          <Button
            data-aw5-primary-action
            type="button"
            className="hidden min-h-[52px] w-full text-[15px] lg:inline-flex"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled}
            aria-busy={busy}
          >
            <PrimaryActionIcon kind={primaryActionKind} />
            {primaryActionLabel}
          </Button>

          <div className="grid grid-cols-4 gap-2 lg:mt-4">
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

          <Button
            type="button"
            variant="ghost"
            className="mt-2 hidden w-full lg:inline-flex"
            onClick={onFinish}
            disabled={busy}
          >
            {finishLabel}
          </Button>
        </aside>
      </main>

      {detailsContent}

      <MobileStickyActions
        allowOnSession
        data-aw5-sticky-actions
        className="z-[60]"
        aria-busy={busy}
      >
        <div className="mx-auto flex w-full max-w-xl items-center gap-2.5">
          {restActive ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-[52px] shrink-0 px-3 text-xs"
              onClick={onAddThirtySeconds}
              disabled={busy}
            >
              <Plus className="h-4 w-4" />
              {addThirtySecondsLabel}
            </Button>
          ) : null}
          <Button
            data-aw5-primary-action
            type="button"
            className="min-h-[52px] flex-1 text-[15px]"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled}
            aria-busy={busy}
          >
            <PrimaryActionIcon kind={primaryActionKind} />
            {primaryActionLabel}
          </Button>
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer allowOnSession className="h-28" />
    </div>
  );
}
