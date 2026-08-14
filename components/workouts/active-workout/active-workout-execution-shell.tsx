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

function actionById(actions: readonly ActiveWorkoutQuickAction[], id: ActiveWorkoutQuickAction["id"]) {
  return actions.find((action) => action.id === id && action.visible);
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
  onStartRest,
  desktopQuickActions
}: ActiveWorkoutExecutionShellProps) {
  const progressPercent = Math.round(progress * 100);
  const resolvedPrimaryActionDisabled = primaryActionKind === "complete-set"
    ? busy || completed
    : primaryActionDisabled;
  const previousSet = actionById(desktopQuickActions, "previous-set");
  const setDetails = actionById(desktopQuickActions, "set-details");
  const exerciseActions = [
    actionById(desktopQuickActions, "replace-today"),
    actionById(desktopQuickActions, "skip-today"),
    actionById(desktopQuickActions, "ask-plaivra")
  ].filter((action): action is ActiveWorkoutQuickAction => Boolean(action));

  return (
    <div
      data-aw5-execution-shell
      data-aw10-execution-first
      data-aw5-session-state={paused ? "paused" : restActive ? "rest" : completed ? "completed" : "set-entry"}
      data-active-set-state
      data-active-set-number={currentSetNumber}
      data-active-set-persisted={persisted ? "true" : "false"}
      data-active-set-completed={completed ? "true" : "false"}
      data-active-set-has-details={hasDetails ? "true" : "false"}
      className="mx-auto w-full max-w-3xl pb-4 lg:pb-8"
      dir={direction}
    >
      {completionContent}

      <header
        data-aw5-header
        className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background/95 py-3 pe-4 ps-[4.25rem] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:pe-6 sm:ps-[4.75rem] lg:static lg:mx-0 lg:px-0"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 data-aw5-session-title className="truncate text-sm font-semibold text-foreground">
                <bdi>{sessionLabel}</bdi>
              </h1>
              <span dir="ltr" className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                {elapsedLabel}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{exercisePositionLabel}</p>
          </div>
          <div data-aw5-mini-heat-map-slot>{miniHeatMap}</div>
          <details className="relative shrink-0" data-aw10-session-menu>
            <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={moreLabel}>
              <Ellipsis className="h-5 w-5" aria-hidden="true" />
            </summary>
            <div className="absolute end-0 z-50 mt-2 w-52 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
              <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-start text-sm hover:bg-muted" onClick={onPauseResume} disabled={busy}>
                {paused ? <CirclePlay className="h-4 w-4" aria-hidden="true" /> : <CirclePause className="h-4 w-4" aria-hidden="true" />}
                {paused ? resumeLabel : pauseLabel}
              </button>
              <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-start text-sm hover:bg-muted" onClick={onFinish} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {finishLabel}
              </button>
            </div>
          </details>
        </div>
        <div className="mt-2.5">
          <div role="progressbar" aria-label={completedSetsLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{completedSetsLabel}</p>
        </div>
      </header>

      <main className="mt-4 sm:mt-6">
        {paused ? (
          <section data-aw10-paused-state className="flex min-h-[52vh] flex-col items-center justify-center text-center">
            <CirclePause className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 text-sm font-semibold text-foreground">{pauseLabel}</p>
            <Button type="button" className="mt-5 min-h-[52px] min-w-52" onClick={onPauseResume} disabled={busy}>
              <CirclePlay className="h-5 w-5" aria-hidden="true" />
              {resumeLabel}
            </Button>
          </section>
        ) : restActive ? (
          <section data-aw10-rest-state className="flex min-h-[52vh] flex-col items-center justify-center text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{restPresetSectionLabel}</p>
            <p dir="ltr" className="mt-3 text-5xl font-semibold tabular-nums tracking-[-0.05em] text-foreground sm:text-6xl">{restLabel}</p>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">{nextContextLabel}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={onAddThirtySeconds} disabled={busy}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {addThirtySecondsLabel}
              </Button>
              {restPresetLabels.map((preset) => (
                <Button key={preset.seconds} type="button" variant="outline" className="min-h-11" onClick={() => onStartRest(preset.seconds)} disabled={busy}>
                  {preset.label}
                </Button>
              ))}
            </div>
          </section>
        ) : (
          <section aria-labelledby="aw5-current-exercise" className="min-w-0">
            <div className="flex items-start gap-3 border-b border-border/70 pb-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted-foreground">{exercisePositionLabel}</p>
                <button
                  type="button"
                  data-aw10-exercise-details-trigger
                  className="mt-1 block max-w-full text-start text-[clamp(1.6rem,6vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-foreground outline-none hover:underline hover:decoration-1 hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(event) => onOpenDetails(event.currentTarget)}
                >
                  <bdi id="aw5-current-exercise" data-aw5-exercise-title>{exerciseName}</bdi>
                </button>
                <p className="mt-2 text-xs text-muted-foreground">{setPositionLabel}</p>
              </div>
              {exerciseActions.length ? (
                <details className="relative shrink-0" data-aw10-exercise-actions>
                  <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label={moreLabel}>
                    <Ellipsis className="h-5 w-5" aria-hidden="true" />
                  </summary>
                  <div className="absolute end-0 z-40 mt-2 w-52 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
                    {exerciseActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className={cn("min-h-11 w-full rounded-md px-3 text-start text-sm hover:bg-muted disabled:opacity-50", action.id === "skip-today" && "text-amber-700 dark:text-amber-300")}
                        onClick={(event) => onQuickAction(action, event.currentTarget)}
                        disabled={action.disabled}
                      >
                        {action.id === "ask-plaivra" ? "Ask ChatGPT" : action.label}
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>

            {previousSet ? (
              <div data-aw10-previous-performance className="mt-4 flex flex-wrap items-center gap-2 border-b border-border/70 pb-4 text-sm">
                <span className="text-muted-foreground">{previousSet.label}</span>
                <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={(event) => onQuickAction(previousSet, event.currentTarget)} disabled={previousSet.disabled}>
                  {previousSet.label}
                </Button>
              </div>
            ) : null}

            <div data-aw5-primary-editor className="mt-5">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="active-set-reps" className="text-xs font-semibold text-muted-foreground">{repsLabel}</Label>
                  <Input id="active-set-reps" dir="ltr" type="text" inputMode="numeric" pattern="[0-9]*" value={repsDraft} onChange={(event) => onRepsChange(event.target.value)} disabled={busy} aria-invalid={Boolean(repsError)} aria-describedby={repsError ? "active-set-reps-error" : undefined} className="h-16 text-center text-3xl font-semibold tabular-nums sm:h-20 sm:text-4xl" placeholder="0" />
                  {repsError ? <p id="active-set-reps-error" role="alert" className="text-xs text-destructive">{repsError}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="active-set-weight" className="text-xs font-semibold text-muted-foreground">{weightLabel}</Label>
                  <Input id="active-set-weight" dir="ltr" type="text" inputMode="decimal" value={weightDraft} onChange={(event) => onWeightChange(event.target.value)} disabled={busy} aria-invalid={Boolean(weightError)} aria-describedby={weightError ? "active-set-weight-error" : undefined} className="h-16 text-center text-3xl font-semibold tabular-nums sm:h-20 sm:text-4xl" placeholder="0" />
                  {weightError ? <p id="active-set-weight-error" role="alert" className="text-xs text-destructive">{weightError}</p> : null}
                </div>
              </div>
              {inputHint ? <p className="mt-2 text-xs text-muted-foreground">{inputHint}</p> : null}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-y border-border/70 py-3">
              <p className="text-xs font-semibold text-muted-foreground">{currentSetLabel}</p>
              {setDetails ? (
                <Button data-active-set-details-trigger type="button" variant="ghost" size="sm" onClick={(event) => onQuickAction(setDetails, event.currentTarget)} disabled={setDetails.disabled}>
                  {setDetails.label}
                </Button>
              ) : null}
            </div>

            <div data-aw5-set-path className="mt-4">
              <h3 className="text-xs font-semibold text-muted-foreground">{setPathLabel}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {setPath.map((item) => (
                  <button key={item.number} data-aw5-set-path-number={item.number} type="button" aria-current={item.state === "active" ? "step" : undefined} aria-label={`${setPathLabel} ${formatSetNumber(item.number)}: ${setPathStateLabels[item.state]}`} disabled={busy} onClick={() => onSelectSet(item.number)} className={cn("inline-flex h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring", item.state === "completed" ? "border-success/35 bg-success/10 text-success" : item.state === "active" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground") }>
                    {item.state === "completed" ? <><Check className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{setPathStateLabels.completed}</span></> : formatSetNumber(item.number)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <div data-aw5-feedback aria-live="polite" className="mt-4">{feedback}</div>
      </main>

      {detailsContent}

      {!paused ? (
        <MobileStickyActions placement="session" data-aw5-sticky-actions className="z-[60]" aria-busy={busy}>
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5">
            {restActive ? (
              <Button data-aw5-add-thirty type="button" variant="outline" className="min-h-[52px] shrink-0 px-3 text-xs" onClick={onAddThirtySeconds} disabled={busy}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {addThirtySecondsLabel}
              </Button>
            ) : null}
            <Button data-aw5-primary-action type="button" className="min-h-[52px] flex-1 text-[15px]" onClick={onPrimaryAction} disabled={resolvedPrimaryActionDisabled} aria-busy={busy}>
              <PrimaryActionIcon kind={primaryActionKind} />
              {primaryActionLabel}
            </Button>
          </div>
        </MobileStickyActions>
      ) : null}
      <MobileStickyActionsSpacer placement="session" />
    </div>
  );
}
