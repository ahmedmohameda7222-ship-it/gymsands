"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clock3,
  Ellipsis,
  FastForward,
  Plus,
  XCircle,
} from "lucide-react";

import {
  MobileStickyActions,
  MobileStickyActionsSpacer,
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
  targetLabel?: string;
  targetValue?: string | null;
  progressionTargetValue?: string | null;
  progressionTargetLabel?: string;
  completedSetsLabel: string;
  elapsedLabel: string;
  progress: number;
  miniHeatMap: ReactNode;
  desktopMiniHeatMap?: ReactNode;
  muscleLoadStatusLabel?: string;
  desktopQuickActions: readonly ActiveWorkoutQuickAction[];
  paused: boolean;
  busy: boolean;
  restActive: boolean;
  restControlsDisabled: boolean;
  restLabel: string;
  nextContextLabel: string;
  nextExerciseName?: string | null;
  nextSetLabel?: string | null;
  nextTargetValue?: string | null;
  nextLabel?: string;
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
  pausedStateLabel: string;
  resumeLabel: string;
  finishLabel: string;
  cancelLabel?: string;
  askChatGptLabel?: string;
  previousPerformanceLabel?: string;
  previousPerformanceValue?: string | null;
  previousPerformanceDate?: string | null;
  previousPerformanceLoading?: boolean;
  usePreviousLabel?: string;
  addThirtySecondsLabel: string;
  restPresetSectionLabel: string;
  restPresetLabels: ReadonlyArray<{ seconds: number; label: string }>;
  feedback: ReactNode;
  detailsContent: ReactNode;
  exerciseNavigatorContent?: ReactNode;
  completionContent?: ReactNode;
  onRepsChange: (value: string) => void;
  onWeightChange: (value: string) => void;
  onSelectSet: (setNumber: number) => void;
  onPrimaryAction: () => void;
  onPauseResume: () => void;
  onFinish: () => void;
  onCancel?: () => void;
  onOpenDetails: (trigger: HTMLButtonElement) => void;
  onOpenExerciseNavigator?: (trigger: HTMLButtonElement) => void;
  onQuickAction: (action: ActiveWorkoutQuickAction, trigger: HTMLButtonElement) => void;
  onUsePrevious?: () => void;
  onAddThirtySeconds: () => void;
  onStartRest: (seconds: number) => void;
};

type OpenMenu = "session" | "exercise" | null;

function PrimaryActionIcon({ kind }: { kind: ActiveWorkoutPrimaryActionKind }) {
  if (kind === "skip-rest") return <FastForward className="h-5 w-5" aria-hidden="true" />;
  if (kind === "resume") return <CirclePlay className="h-5 w-5" aria-hidden="true" />;
  return <CheckCircle2 className="h-5 w-5" aria-hidden="true" />;
}

function actionById(actions: readonly ActiveWorkoutQuickAction[], id: ActiveWorkoutQuickAction["id"]) {
  return actions.find((action) => action.id === id && action.visible);
}

function MenuButton({
  label,
  expanded,
  onClick,
  menuRef,
  testId,
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
  menuRef: React.RefObject<HTMLButtonElement | null>;
  testId: string;
}) {
  return (
    <button
      ref={menuRef}
      type="button"
      data-aw-menu-trigger={testId}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Ellipsis className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

export function ActiveWorkoutExecutionShell({
  direction,
  sessionLabel,
  exerciseName,
  exercisePositionLabel,
  setPositionLabel,
  targetLabel,
  targetValue,
  progressionTargetValue,
  progressionTargetLabel,
  completedSetsLabel,
  elapsedLabel,
  progress,
  miniHeatMap,
  paused,
  busy,
  restActive,
  restControlsDisabled,
  restLabel,
  nextContextLabel,
  nextExerciseName,
  nextSetLabel,
  nextTargetValue,
  nextLabel,
  currentSetLabel,
  repsLabel,
  weightLabel,
  repsDraft,
  weightDraft,
  repsError,
  weightError,
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
  pausedStateLabel,
  resumeLabel,
  finishLabel,
  cancelLabel,
  askChatGptLabel,
  previousPerformanceLabel,
  previousPerformanceValue,
  previousPerformanceDate,
  previousPerformanceLoading = false,
  usePreviousLabel,
  addThirtySecondsLabel,
  restPresetSectionLabel,
  restPresetLabels,
  feedback,
  detailsContent,
  exerciseNavigatorContent,
  completionContent,
  onRepsChange,
  onWeightChange,
  onSelectSet,
  onPrimaryAction,
  onPauseResume,
  onFinish,
  onCancel,
  onOpenDetails,
  onOpenExerciseNavigator,
  onQuickAction,
  onUsePrevious,
  onAddThirtySeconds,
  onStartRest,
  desktopQuickActions,
}: ActiveWorkoutExecutionShellProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const sessionMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const exerciseMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const progressPercent = Math.round(progress * 100);
  const resolvedPrimaryActionDisabled = primaryActionKind === "complete-set" ? busy || completed : primaryActionDisabled;
  const setDetails = actionById(desktopQuickActions, "set-details");
  const exerciseActions = [
    actionById(desktopQuickActions, "replace-today"),
    actionById(desktopQuickActions, "skip-today"),
    actionById(desktopQuickActions, "ask-plaivra"),
  ].filter((action): action is ActiveWorkoutQuickAction => Boolean(action));
  const showPreviousPerformance = Boolean(previousPerformanceLoading || previousPerformanceValue || previousPerformanceDate);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const selector = openMenu === "session"
        ? "[data-aw10-session-menu]"
        : "[data-aw10-exercise-actions]";
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(selector)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const selector = openMenu === "session"
        ? "[data-aw10-session-menu]"
        : "[data-aw10-exercise-actions]";
      const menu = document.querySelector(`${selector} [role="menu"]`);
      const enabledItems = menu
        ? Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter((item) => !item.disabled)
        : [];
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && enabledItems.length) {
        event.preventDefault();
        const currentIndex = enabledItems.findIndex((item) => item === document.activeElement);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? enabledItems.length - 1
            : event.key === "ArrowDown"
              ? (currentIndex + 1 + enabledItems.length) % enabledItems.length
              : currentIndex < 0
                ? enabledItems.length - 1
                : (currentIndex - 1 + enabledItems.length) % enabledItems.length;
        enabledItems[nextIndex]?.focus();
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      const previous = openMenu;
      setOpenMenu(null);
      window.requestAnimationFrame(() => {
        (previous === "session" ? sessionMenuTriggerRef.current : exerciseMenuTriggerRef.current)?.focus();
      });
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  function closeThen(action: () => void) {
    setOpenMenu(null);
    action();
  }

  function closeThenWithTrigger(action: (trigger: HTMLButtonElement) => void, trigger: HTMLButtonElement) {
    setOpenMenu(null);
    action(trigger);
  }

  const exerciseNavigatorTrigger = onOpenExerciseNavigator ? (
    <button
      type="button"
      data-aw-exercise-navigator-trigger
      className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => closeThenWithTrigger(onOpenExerciseNavigator, event.currentTarget)}
      aria-haspopup="dialog"
    >
      {exercisePositionLabel}
      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  ) : <p className="text-xs font-semibold text-muted-foreground">{exercisePositionLabel}</p>;

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
      className="mx-auto w-full max-w-3xl pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:pb-8"
      dir={direction}
    >
      {completionContent}

      <header
        data-aw5-header
        className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background/95 py-3 pe-4 ps-[4.25rem] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:pe-6 sm:ps-[4.75rem] lg:static lg:mx-0 lg:px-0"
      >
        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 data-aw5-session-title className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
              <bdi>{sessionLabel}</bdi>
            </h1>
            <span dir="ltr" className="mt-1 inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {elapsedLabel}
            </span>
          </div>
          <div data-aw5-mini-heat-map-slot className="shrink-0">{miniHeatMap}</div>
          <div className="relative shrink-0" data-aw10-session-menu data-state={openMenu === "session" ? "open" : "closed"}>
            <MenuButton
              menuRef={sessionMenuTriggerRef}
              testId="session"
              label={moreLabel}
              expanded={openMenu === "session"}
              onClick={() => setOpenMenu((current) => current === "session" ? null : "session")}
            />
            {openMenu === "session" ? (
              <div role="menu" className="absolute end-0 z-50 mt-1.5 w-56 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
                <button type="button" role="menuitem" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-sm hover:bg-muted disabled:opacity-50" onClick={() => closeThen(onPauseResume)} disabled={busy}>
                  {paused ? <CirclePlay className="h-4 w-4" aria-hidden="true" /> : <CirclePause className="h-4 w-4" aria-hidden="true" />}
                  {paused ? resumeLabel : pauseLabel}
                </button>
                <button type="button" role="menuitem" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-sm hover:bg-muted disabled:opacity-50" onClick={() => closeThen(onFinish)} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {finishLabel}
                </button>
                {cancelLabel && onCancel ? (
                  <>
                    <div className="my-1 border-t border-border" aria-hidden="true" />
                    <button type="button" role="menuitem" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50" onClick={() => closeThen(onCancel)} disabled={busy}>
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      {cancelLabel}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-2.5">
          <div role="progressbar" aria-label={completedSetsLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{completedSetsLabel}</p>
        </div>
      </header>

      <main className="mt-2 sm:mt-6">
        {paused ? (
          <section data-aw10-paused-state className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
            <CirclePause className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground">{pausedStateLabel}</p>
            <p data-aw10-paused-elapsed dir="ltr" className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{elapsedLabel}</p>
            <p className="mt-3 max-w-lg text-xl font-semibold text-foreground"><bdi>{exerciseName}</bdi></p>
            <p className="mt-1 text-sm text-muted-foreground">{setPositionLabel}</p>
            <div className="mt-3">{exerciseNavigatorTrigger}</div>
            <Button type="button" className="mt-6 min-h-[52px] min-w-52" onClick={onPauseResume} disabled={busy}>
              <CirclePlay className="h-5 w-5" aria-hidden="true" />
              {resumeLabel}
            </Button>
          </section>
        ) : restActive ? (
          <section data-aw10-rest-state className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
            <div className="mb-2">{exerciseNavigatorTrigger}</div>
            <p data-aw10-rest-label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{restPresetSectionLabel}</p>
            <p dir="ltr" className="mt-3 text-5xl font-semibold tabular-nums tracking-[-0.05em] text-foreground sm:text-6xl">{restLabel}</p>
            <div className="mt-5 max-w-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{nextLabel ?? "Next"}</p>
              {nextExerciseName ? <p className="mt-1 text-xl font-semibold text-foreground"><bdi>{nextExerciseName}</bdi></p> : null}
              <p className="mt-1 text-sm text-muted-foreground">
                {nextSetLabel ?? nextContextLabel}
                {nextTargetValue ? <> · <bdi dir="auto">{nextTargetValue}</bdi></> : null}
              </p>
            </div>
            <div data-aw5-rest-presets className="mt-6 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={onAddThirtySeconds} disabled={restControlsDisabled}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {addThirtySecondsLabel}
              </Button>
              {restPresetLabels.map((preset) => (
                <Button key={preset.seconds} type="button" variant="outline" className="min-h-11 min-w-12" onClick={() => onStartRest(preset.seconds)} disabled={restControlsDisabled}>
                  {preset.label}
                </Button>
              ))}
            </div>
          </section>
        ) : (
          <section aria-labelledby="aw5-current-exercise" className="min-w-0">
            <div className="flex items-start gap-3 border-b border-border/70 pb-2 sm:pb-4">
              <div className="min-w-0 flex-1">
                {exerciseNavigatorTrigger}
                <h2 id="aw5-current-exercise" data-aw5-exercise-title className="mt-0.5 text-[clamp(1.5rem,6vw,2.5rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground">
                  <button
                    type="button"
                    data-aw10-exercise-details-trigger
                    aria-label={exerciseName}
                    className="group flex min-h-12 max-w-full items-start gap-1.5 text-start outline-none hover:underline hover:decoration-1 hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(event) => closeThenWithTrigger(onOpenDetails, event.currentTarget)}
                  >
                    <bdi className="line-clamp-2 min-w-0 break-words lg:line-clamp-none">{exerciseName}</bdi>
                    <ChevronRight className="mt-[0.18em] h-[0.8em] w-[0.8em] shrink-0 rtl:rotate-180" aria-hidden="true" />
                  </button>
                </h2>
                <p className="mt-1.5 text-xs text-muted-foreground">{setPositionLabel}</p>
              </div>
              {exerciseActions.length ? (
                <div className="relative shrink-0" data-aw10-exercise-actions data-state={openMenu === "exercise" ? "open" : "closed"}>
                  <MenuButton
                    menuRef={exerciseMenuTriggerRef}
                    testId="exercise"
                    label={moreLabel}
                    expanded={openMenu === "exercise"}
                    onClick={() => setOpenMenu((current) => current === "exercise" ? null : "exercise")}
                  />
                  {openMenu === "exercise" ? (
                    <div role="menu" className="absolute end-0 z-40 mt-1.5 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                      {exerciseActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          role="menuitem"
                          className={cn("min-h-11 w-full rounded-lg px-3 text-start text-sm hover:bg-muted disabled:opacity-50", action.id === "skip-today" && "text-amber-700 dark:text-amber-300")}
                          onClick={(event) => closeThenWithTrigger((trigger) => onQuickAction(action, trigger), event.currentTarget)}
                          disabled={action.disabled}
                        >
                          {action.id === "ask-plaivra" ? (askChatGptLabel ?? action.label) : action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {(targetValue || progressionTargetValue) ? (
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border/70 py-2 text-sm sm:py-3">
                {targetValue ? <p data-aw10-current-target><span className="text-muted-foreground">{targetLabel}</span> · <bdi className="font-semibold text-foreground" dir="auto">{targetValue}</bdi></p> : null}
                {progressionTargetValue ? <p data-aw-progression-target><span className="text-muted-foreground">{progressionTargetLabel}</span> · <bdi className="font-semibold text-foreground" dir="auto">{progressionTargetValue}</bdi></p> : null}
              </div>
            ) : null}

            {showPreviousPerformance ? (
              <section data-aw10-previous-performance className="border-b border-border/70 py-2 sm:py-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground">{previousPerformanceLabel}</p>
                    {previousPerformanceLoading ? <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" /> : (
                      <>
                        {previousPerformanceValue ? <p className="mt-1 text-sm font-semibold text-foreground"><bdi dir="auto">{previousPerformanceValue}</bdi></p> : null}
                        {previousPerformanceDate ? <p className="mt-0.5 text-xs text-muted-foreground">{previousPerformanceDate}</p> : null}
                      </>
                    )}
                  </div>
                  {previousPerformanceValue && onUsePrevious && usePreviousLabel ? (
                    <Button type="button" variant="ghost" className="min-h-11 shrink-0" onClick={onUsePrevious} disabled={busy || completed}>{usePreviousLabel}</Button>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section data-aw5-primary-editor className="py-3 sm:py-5" aria-label={currentSetLabel}>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div data-aw10-reps-field className="min-w-0 space-y-1.5">
                  <Label htmlFor="active-set-reps" className="block break-words text-xs leading-tight sm:text-sm">{repsLabel}</Label>
                  <Input
                    id="active-set-reps"
                    dir="ltr"
                    inputMode="numeric"
                    value={repsDraft}
                    onChange={(event) => onRepsChange(event.target.value)}
                    aria-invalid={Boolean(repsError)}
                    aria-describedby={repsError ? "active-set-reps-error" : undefined}
                    disabled={busy || completed}
                    className="h-14 text-center text-xl font-semibold tabular-nums"
                  />
                  {repsError ? <p id="active-set-reps-error" role="alert" className="text-xs text-destructive">{repsError}</p> : null}
                </div>
                <div data-aw10-weight-field className="min-w-0 space-y-1.5">
                  <Label htmlFor="active-set-weight" className="block break-words text-xs leading-tight sm:text-sm">{weightLabel}</Label>
                  <Input
                    id="active-set-weight"
                    dir="ltr"
                    inputMode="decimal"
                    value={weightDraft}
                    onChange={(event) => onWeightChange(event.target.value)}
                    aria-invalid={Boolean(weightError)}
                    aria-describedby={weightError ? "active-set-weight-error" : undefined}
                    disabled={busy || completed}
                    className="h-14 text-center text-xl font-semibold tabular-nums"
                  />
                  {weightError ? <p id="active-set-weight-error" role="alert" className="text-xs text-destructive">{weightError}</p> : null}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <p data-aw10-sets-label className="text-xs font-semibold text-muted-foreground">{setPathLabel}</p>
                {setDetails ? (
                  <Button type="button" data-active-set-details-trigger variant="ghost" className="min-h-11 px-2" onClick={(event) => closeThenWithTrigger((trigger) => onQuickAction(setDetails, trigger), event.currentTarget)} disabled={setDetails.disabled}>
                    {setDetails.label}
                  </Button>
                ) : null}
              </div>
              <ol data-aw5-set-path data-aw10-set-path className="mt-1 flex min-w-0 items-center" aria-label={setPathLabel}>
                {setPath.map((item, index) => (
                  <li key={item.number} className="flex min-w-0 flex-1 items-center last:flex-none">
                    <button
                      type="button"
                      data-aw5-set-path-number={item.number}
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                        item.state === "completed" && "border-primary bg-primary text-primary-foreground",
                        item.state === "active" && "border-2 border-primary bg-background text-primary",
                        item.state === "available" && "border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground",
                      )}
                      aria-label={`${setPathStateLabels[item.state]} ${formatSetNumber(item.number)}`}
                      aria-current={item.state === "active" ? "step" : undefined}
                      onClick={() => onSelectSet(item.number)}
                      disabled={busy || item.state === "active"}
                    >
                      {item.state === "completed" ? <Check className="h-4 w-4" aria-hidden="true" /> : formatSetNumber(item.number)}
                    </button>
                    {index < setPath.length - 1 ? <span aria-hidden="true" className={cn("mx-1 h-px min-w-2 flex-1 bg-border", item.state === "completed" && "bg-primary/70")} /> : null}
                  </li>
                ))}
              </ol>
            </section>
          </section>
        )}
      </main>

      <div data-aw5-feedback className="mt-3" aria-live="polite">{feedback}</div>
      {detailsContent}
      {exerciseNavigatorContent}

      {!paused ? (
        <>
          <MobileStickyActionsSpacer placement="session" />
          <MobileStickyActions placement="session" data-aw5-sticky-actions data-aw10-sticky-actions>
            <Button type="button" data-aw5-primary-action className="min-h-[54px] w-full text-base font-semibold" onClick={onPrimaryAction} disabled={resolvedPrimaryActionDisabled}>
              <PrimaryActionIcon kind={primaryActionKind} />
              {primaryActionLabel}
            </Button>
          </MobileStickyActions>

          <div className="mt-7 hidden lg:block">
            <Button type="button" data-aw5-primary-action className="min-h-[54px] w-full text-base font-semibold" onClick={onPrimaryAction} disabled={resolvedPrimaryActionDisabled}>
              <PrimaryActionIcon kind={primaryActionKind} />
              {primaryActionLabel}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
