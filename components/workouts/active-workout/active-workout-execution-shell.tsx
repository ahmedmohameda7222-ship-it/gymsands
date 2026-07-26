"use client";

import { useRef, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Clock,
  FastForward,
  Flag,
  MoreHorizontal,
  PersonStanding,
  TimerReset
} from "lucide-react";

import { MobileStickyActions, MobileStickyActionsSpacer } from "@/components/layout/mobile-sticky-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  activeWorkoutProgress,
  type ActiveWorkoutCoreLabels
} from "./active-workout-ui-model";

type SetPathItem = {
  number: number;
  completed: boolean;
  active: boolean;
};

type ActiveWorkoutExecutionShellProps = {
  labels: ActiveWorkoutCoreLabels;
  direction: "ltr" | "rtl";
  sessionLabel: string;
  contextLabel: string;
  exerciseName: string;
  exerciseIndex: number;
  exerciseCount: number;
  setIndex: number;
  setCount: number;
  completedSets: number;
  totalSets: number;
  elapsedLabel: string;
  restLabel: string;
  reps: string;
  weightKg: string;
  setPath: SetPathItem[];
  isResting: boolean;
  isPaused: boolean;
  isBusy: boolean;
  canCompleteSet: boolean;
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  onChangeReps: (value: string) => void;
  onChangeWeight: (value: string) => void;
  onSelectSet: (index: number) => void;
  onCompleteSet: () => void;
  onSkipRest: () => void;
  onAddRest: () => void;
  onStartRest: (seconds: number) => void;
  onTogglePause: () => void;
  onFinishSession: () => void;
  detailsContent: ReactNode;
  feedback?: ReactNode;
  miniHeatMap?: ReactNode;
};

export function ActiveWorkoutExecutionShell({
  labels,
  direction,
  sessionLabel,
  contextLabel,
  exerciseName,
  exerciseIndex,
  exerciseCount,
  setIndex,
  setCount,
  completedSets,
  totalSets,
  elapsedLabel,
  restLabel,
  reps,
  weightKg,
  setPath,
  isResting,
  isPaused,
  isBusy,
  canCompleteSet,
  detailsOpen,
  onDetailsOpenChange,
  onChangeReps,
  onChangeWeight,
  onSelectSet,
  onCompleteSet,
  onSkipRest,
  onAddRest,
  onStartRest,
  onTogglePause,
  onFinishSession,
  detailsContent,
  feedback,
  miniHeatMap
}: ActiveWorkoutExecutionShellProps) {
  const progress = activeWorkoutProgress(completedSets, totalSets);
  const activeSetNumber = setPath[setIndex]?.number ?? setIndex + 1;
  const detailsTriggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div
      className="mx-auto w-full max-w-[1180px] space-y-4 pb-28 lg:pb-4"
      dir={direction}
      data-aw5-execution-shell
      aria-busy={isBusy}
    >
      <header className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-2xl lg:border lg:bg-card/80 lg:px-5">
        <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold"><bdi>{sessionLabel}</bdi></p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{contextLabel}</span>
              <span aria-hidden="true">·</span>
              <span dir="ltr" className="tabular-nums">{exerciseIndex + 1}/{Math.max(1, exerciseCount)}</span>
              <span>{labels.exercises}</span>
              <span aria-hidden="true">·</span>
              <span dir="ltr" className="tabular-nums">{setIndex + 1}/{Math.max(1, setCount)}</span>
              <span>{labels.sets}</span>
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span dir="ltr" className="font-medium tabular-nums text-foreground">{elapsedLabel}</span>
              </span>
              {isResting ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                  <TimerReset className="h-3.5 w-3.5" aria-hidden="true" />
                  <span dir="ltr" className="tabular-nums">{restLabel}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div
            className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/25"
            aria-label={labels.currentSessionHeat}
            data-aw5-mini-heat-map-slot
          >
            {miniHeatMap ?? <PersonStanding className="h-10 w-10 text-muted-foreground/70" aria-hidden="true" />}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span><span dir="ltr" className="tabular-nums">{completedSets}/{totalSets}</span> {labels.sets}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 px-3"
            onClick={onTogglePause}
            disabled={isBusy}
            aria-label={isPaused ? labels.resume : labels.pause}
          >
            {isPaused ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}
            {isPaused ? labels.resume : labels.pause}
          </Button>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="space-y-4">
          <section className="rounded-2xl border border-border/70 bg-card/85 p-4 sm:p-5" aria-labelledby="aw5-current-exercise">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{labels.set(activeSetNumber)}</p>
                <button
                  id="aw5-current-exercise"
                  type="button"
                  className="mt-1 block max-w-full text-start text-2xl font-semibold leading-tight tracking-[-0.03em] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-3xl"
                  onClick={() => onDetailsOpenChange(true)}
                >
                  <bdi>{exerciseName}</bdi>
                </button>
              </div>
              <Button
                ref={detailsTriggerRef}
                data-active-set-details-trigger
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0 rounded-xl"
                aria-label={labels.openDetails}
                onClick={() => onDetailsOpenChange(true)}
                disabled={isBusy}
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="active-set-reps" className="text-xs font-medium text-muted-foreground">{labels.reps}</Label>
                <Input
                  id="active-set-reps"
                  dir="ltr"
                  inputMode="numeric"
                  className="h-16 rounded-xl text-center text-2xl font-semibold tabular-nums sm:h-[72px] sm:text-3xl"
                  value={reps}
                  onChange={(event) => onChangeReps(event.target.value)}
                  disabled={isBusy || isPaused}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="active-set-weight" className="text-xs font-medium text-muted-foreground">{labels.weightKg}</Label>
                <Input
                  id="active-set-weight"
                  dir="ltr"
                  inputMode="decimal"
                  className="h-16 rounded-xl text-center text-2xl font-semibold tabular-nums sm:h-[72px] sm:text-3xl"
                  value={weightKg}
                  onChange={(event) => onChangeWeight(event.target.value)}
                  disabled={isBusy || isPaused}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{labels.sets}</span>
                <span dir="ltr" className="tabular-nums">{setIndex + 1}/{setCount}</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, setPath.length)}, minmax(0, 1fr))` }}>
                {setPath.map((item, index) => (
                  <button
                    key={item.number}
                    type="button"
                    className={cn(
                      "flex h-12 items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      item.completed && "border-success/35 bg-success/10 text-success",
                      item.active && !item.completed && "border-primary/50 bg-primary/10 text-primary",
                      !item.active && !item.completed && "border-border bg-muted/25 text-muted-foreground hover:border-primary/40"
                    )}
                    onClick={() => onSelectSet(index)}
                    disabled={isBusy}
                    aria-current={item.active ? "step" : undefined}
                    aria-label={labels.set(item.number)}
                  >
                    {item.completed ? <Check className="h-4 w-4" aria-hidden="true" /> : <span dir="ltr" className="tabular-nums">{item.number}</span>}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {feedback}
        </main>

        <aside className="hidden space-y-3 lg:block" aria-label={labels.workoutContext}>
          <section className="rounded-2xl border border-border/70 bg-card/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{isResting ? labels.rest : labels.startRest}</p>
              <span dir="ltr" className="text-xl font-semibold tabular-nums text-primary">{restLabel}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[30, 60, 90, 180].map((seconds) => (
                <Button key={seconds} type="button" variant="outline" className="min-h-11" onClick={() => onStartRest(seconds)} disabled={isBusy || isPaused}>
                  {seconds === 180 ? "3m" : `${seconds}s`}
                </Button>
              ))}
            </div>
            {isResting ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="min-h-12" onClick={onAddRest} disabled={isBusy}>{labels.addThirtySeconds}</Button>
                <Button type="button" className="min-h-12" onClick={onSkipRest} disabled={isBusy}>{labels.skipRest}</Button>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/80 p-4">
            <div className="grid gap-2">
              <Button type="button" variant="outline" className="min-h-12" onClick={onTogglePause} disabled={isBusy}>
                {isPaused ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}
                {isPaused ? labels.resume : labels.pause}
              </Button>
              <Button type="button" variant="outline" className="min-h-12" onClick={() => onDetailsOpenChange(true)} disabled={isBusy}>
                <MoreHorizontal className="h-4 w-4" /> {labels.more}
              </Button>
              <Button type="button" className="min-h-12" onClick={onFinishSession} disabled={isBusy}>
                <Flag className="h-4 w-4" /> {labels.finish}
              </Button>
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={detailsOpen} onOpenChange={onDetailsOpenChange}>
        <DialogContent
          data-active-set-details-dialog
          layout="responsive-drawer"
          closeLabel={labels.close}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            detailsTriggerRef.current?.focus();
          }}
          className="max-h-[88dvh] overflow-y-auto p-5 lg:inset-y-6 lg:left-auto lg:right-6 lg:h-auto lg:w-[420px] lg:max-w-[420px] lg:translate-x-0 lg:translate-y-0 lg:rounded-2xl lg:border"
        >
          <DialogHeader>
            <DialogTitle>{labels.advancedDetails}</DialogTitle>
            <DialogDescription><bdi>{exerciseName}</bdi> · {labels.set(activeSetNumber)}</DialogDescription>
          </DialogHeader>
          {detailsContent}
        </DialogContent>
      </Dialog>

      <MobileStickyActions allowOnSession className="bottom-[env(safe-area-inset-bottom)] z-[60]">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-semibold"><bdi>{exerciseName}</bdi></p>
            <p className="truncate text-xs text-muted-foreground">
              {isResting ? <><span dir="ltr" className="tabular-nums">{restLabel}</span> · {labels.rest}</> : labels.set(activeSetNumber)}
            </p>
          </div>
          {isResting ? (
            <>
              <Button type="button" variant="outline" className="min-h-[52px] px-3" onClick={onAddRest} disabled={isBusy}>{labels.addThirtySeconds}</Button>
              <Button type="button" className="min-h-[52px] flex-1" onClick={onSkipRest} disabled={isBusy}>
                <FastForward className="h-5 w-5" /> {labels.skipRest}
              </Button>
            </>
          ) : isPaused ? (
            <Button type="button" className="min-h-[52px] flex-1" onClick={onTogglePause} disabled={isBusy}>
              <CirclePlay className="h-5 w-5" /> {labels.resume}
            </Button>
          ) : (
            <Button type="button" className="min-h-[52px] flex-1" onClick={onCompleteSet} disabled={isBusy || !canCompleteSet}>
              <CheckCircle2 className="h-5 w-5" /> {labels.completeSet(activeSetNumber)}
            </Button>
          )}
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer allowOnSession className="h-28" />
    </div>
  );
}
