"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Dumbbell,
  RefreshCcw,
  Save,
  Trophy
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ActiveWorkoutMuscleLoadSection } from "@/components/workouts/active-workout/active-workout-muscle-load-section";
import type { ActiveWorkoutMuscleLoadController } from "@/components/workouts/active-workout/active-workout-muscle-load-controller";
import { cn } from "@/lib/utils";
import type {
  ActiveWorkoutFormatters,
  ActiveWorkoutTranslator
} from "@/lib/i18n/active-workout";
import { isolateBidiText } from "@/lib/i18n/active-workout";

import type {
  ActiveWorkoutReviewProjection,
  ActiveWorkoutSummary
} from "./active-workout-runtime-model";

export type ActiveWorkoutReviewBridgeProps = {
  open: boolean;
  busy: boolean;
  sessionAvailable: boolean;
  durationMinutes: number;
  totalVolume: number;
  previewPrs: readonly string[];
  sessionNotes: string;
  onSessionNotesChange: (value: string) => void;
  onComplete: () => void;
  onContinue: () => void;
  onJumpToSet: (exerciseIndex: number, setIndex: number) => void;
  onReopenSet: (exerciseIndex: number, setIndex: number) => void;
  onRetryCompletion: () => void;
  completionRecovery: "none" | "retry" | "reconnect";
  completedSummary: ActiveWorkoutSummary | null;
  review: ActiveWorkoutReviewProjection;
  dayName: string;
  muscleLoadController: ActiveWorkoutMuscleLoadController;
  tr: ActiveWorkoutTranslator;
  formatters: ActiveWorkoutFormatters;
};

function InfoStat({
  label,
  value,
  valueDirection = "auto"
}: {
  label: string;
  value: string;
  valueDirection?: "auto" | "ltr";
}) {
  return (
    <div className="rounded-[16px] border border-border/60 bg-muted/30 p-3 text-center">
      <p dir={valueDirection} className="text-lg font-bold tracking-[-0.03em] tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function WorkoutSummaryCard({
  summary,
  dayName,
  muscleLoadController,
  tr,
  formatters
}: {
  summary: ActiveWorkoutSummary;
  dayName: string;
  muscleLoadController: ActiveWorkoutMuscleLoadController;
  tr: ActiveWorkoutTranslator;
  formatters: ActiveWorkoutFormatters;
}) {
  return (
    <div data-aw5-completed-summary data-aw7-completed-summary>
      <Card className="rounded-[28px] border-success/20 bg-success/[0.04]">
        <CardContent className="space-y-6 p-5 sm:p-6 lg:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
              <Dumbbell className="h-5 w-5 text-success" aria-hidden="true" />
            </div>
            <div>
              <h1 id="aw5-completed-summary-title" className="text-xl font-semibold">
                {tr("completion.dayComplete", { day: isolateBidiText(dayName) })}
              </h1>
              <p className="text-sm text-muted-foreground">{tr("completion.savedHistory")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <InfoStat
              label={tr("review.minutes")}
              value={formatters.measurement(summary.durationMinutes, "minutes", 0)}
            />
            <InfoStat
              label={tr("review.completedSets")}
              value={formatters.ratio(summary.completedSets, summary.totalPlannedSets)}
              valueDirection="ltr"
            />
            <InfoStat
              label={tr("review.completedExercises")}
              value={formatters.integer(summary.completedExercises)}
            />
            <InfoStat
              label={tr("review.partial")}
              value={formatters.integer(summary.partialExercises.length)}
            />
            <InfoStat
              label={tr("review.skipped")}
              value={formatters.integer(summary.skippedExercises.length)}
            />
            <InfoStat
              label={tr("review.replaced")}
              value={formatters.integer(summary.replacedExercises.length)}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
            <div className="space-y-4">
              {summary.prs.length ? (
                <section className="rounded-[16px] border border-primary/20 bg-primary/[0.04] p-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Trophy className="h-4 w-4" aria-hidden="true" />
                    {tr("completion.newPrs", { count: summary.prs.length })}
                  </h2>
                  <ul className="mt-2 space-y-1">
                    {summary.prs.map((pr) => (
                      <li key={pr} className="text-sm text-muted-foreground">- {pr}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <section className="rounded-[16px] border border-border/70 p-4">
                <h2 className="text-sm font-semibold">{tr("review.workoutNote")}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {summary.notes || tr("review.noWorkoutNote")}
                </p>
              </section>
              <section
                data-aw8-performance
                className="rounded-[16px] border border-border/70 p-4"
                aria-labelledby="aw8-performance-title"
              >
                <h2 id="aw8-performance-title" className="text-sm font-semibold">
                  {tr("completion.performance")}
                </h2>
                {summary.performance ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <InfoStat
                      label={tr("review.volume")}
                      value={formatters.measurement(
                        summary.performance.externalLoadVolume,
                        "kg"
                      )}
                    />
                    <InfoStat
                      label={tr("completion.averageRpe")}
                      value={summary.performance.averageRpe === null
                        ? tr("completion.metricUnavailable")
                        : formatters.decimal(summary.performance.averageRpe, 1)}
                    />
                    <InfoStat
                      label={tr("completion.bestEstimatedOneRepMax")}
                      value={summary.performance.exercises.some(
                        (exercise) => exercise.bestEstimatedOneRepMaxKg !== null
                      )
                        ? formatters.measurement(
                            Math.max(
                              ...summary.performance.exercises.map(
                                (exercise) => exercise.bestEstimatedOneRepMaxKg ?? 0
                              )
                            ),
                            "kg"
                          )
                        : tr("completion.metricUnavailable")}
                    />
                    <InfoStat
                      label={tr("completion.performanceChange")}
                      value={(() => {
                        const changes = summary.performance.exercises.flatMap(
                          (exercise) => exercise.performanceChangePercent === null
                            ? []
                            : [exercise.performanceChangePercent]
                        );
                        if (!changes.length) return tr("completion.neutralChange");
                        const value = changes.reduce((sum, item) => sum + item, 0) / changes.length;
                        return `${value > 0 ? "+" : ""}${formatters.decimal(value, 1)}%`;
                      })()}
                      valueDirection="ltr"
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {tr("completion.metricUnavailable")}
                  </p>
                )}
              </section>
              {(summary.partialExercises.length
                || summary.skippedExercises.length
                || summary.replacedExercises.length) ? (
                <section className="rounded-[16px] border border-border/70 p-4">
                  <h2 className="text-sm font-semibold">{tr("completion.workSummary")}</h2>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {summary.partialExercises.map((name) => (
                      <li key={`partial-${name}`}>{tr("completion.partialExercise", { name: isolateBidiText(name) })}</li>
                    ))}
                    {summary.skippedExercises.map((name) => (
                      <li key={`skipped-${name}`}>{tr("completion.skippedExercise", { name: isolateBidiText(name) })}</li>
                    ))}
                    {summary.replacedExercises.map((item) => (
                      <li key={`${item.originalName}-${item.currentName}`}>
                        {tr("completion.replacedExercise", {
                          original: isolateBidiText(item.originalName),
                          current: isolateBidiText(item.currentName)
                        })}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <section className="rounded-[18px] border border-border/70 p-4" aria-labelledby="aw7-final-muscle-load">
              <h2 id="aw7-final-muscle-load" className="text-base font-semibold">
                {tr("completion.finalMuscleLoad")}
              </h2>
              <ActiveWorkoutMuscleLoadSection controller={muscleLoadController} />
            </section>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline" className="min-h-12 sm:min-w-44">
              <Link href="/dashboard" prefetch={false}>{tr("completion.backToToday")}</Link>
            </Button>
            <Button asChild className="min-h-12 sm:min-w-44">
              <Link href="/my-workout/plans" prefetch={false}>{tr("completion.backToWorkouts")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ActiveWorkoutReviewBridge({
  open,
  busy,
  sessionAvailable,
  durationMinutes,
  totalVolume,
  previewPrs,
  sessionNotes,
  onSessionNotesChange,
  onComplete,
  onContinue,
  onJumpToSet,
  onReopenSet,
  onRetryCompletion,
  completionRecovery,
  completedSummary,
  review,
  dayName,
  muscleLoadController,
  tr,
  formatters
}: ActiveWorkoutReviewBridgeProps) {
  const completionSurfaceRef = useRef<HTMLDivElement>(null);
  const partialConfirmRef = useRef<HTMLButtonElement>(null);
  const [partialConfirmOpen, setPartialConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!completedSummary) return;
    const surface = completionSurfaceRef.current;
    if (!surface) return;
    const restored: Array<{
      element: HTMLElement;
      inert: boolean;
      ariaHidden: string | null;
      visibility: string;
    }> = [];
    const restoredLandmarks: Array<{ element: HTMLElement; role: string | null }> = [];
    let branch: HTMLElement = surface;
    while (branch !== document.body) {
      const parent = branch.parentElement;
      if (!parent) break;
      if (
        parent !== surface
        && (parent.tagName === "MAIN" || parent.getAttribute("role") === "main")
      ) {
        restoredLandmarks.push({ element: parent, role: parent.getAttribute("role") });
        parent.setAttribute("role", "presentation");
      }
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        restored.push({
          element: sibling,
          inert: sibling.inert,
          ariaHidden: sibling.getAttribute("aria-hidden"),
          visibility: sibling.style.visibility
        });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
        sibling.style.visibility = "hidden";
      }
      branch = parent;
    }
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(surface.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.inert && element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        surface.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === surface)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    surface.addEventListener("keydown", keepFocusInside);
    surface.focus();
    window.history.replaceState(
      { ...(window.history.state ?? {}), plaivraAw7Terminal: true },
      "",
      window.location.href
    );
    return () => {
      surface.removeEventListener("keydown", keepFocusInside);
      for (const item of restored) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
        item.element.style.visibility = item.visibility;
      }
      for (const item of restoredLandmarks) {
        if (item.role === null) item.element.removeAttribute("role");
        else item.element.setAttribute("role", item.role);
      }
    };
  }, [completedSummary]);

  if (completedSummary) {
    return (
      <div
        ref={completionSurfaceRef}
        data-aw5-completion-surface
        data-aw7-completion-surface
        role="main"
        aria-labelledby="aw5-completed-summary-title"
        tabIndex={-1}
        className="fixed inset-0 z-[70] overflow-y-auto bg-background outline-none"
      >
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl items-start px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:items-center lg:py-10">
          <div className="w-full">
            <WorkoutSummaryCard
              summary={completedSummary}
              dayName={dayName}
              muscleLoadController={muscleLoadController}
              tr={tr}
              formatters={formatters}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!open) return null;

  const finish = () => {
    if (review.incompleteSets > 0) {
      setPartialConfirmOpen(true);
      return;
    }
    onComplete();
  };

  return (
    <>
      <section
        data-aw5-session-review
        data-aw7-review-surface
        aria-labelledby="aw7-review-title"
        className="fixed inset-0 z-[35] flex min-h-0 flex-col bg-background"
      >
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-4 py-4 pe-4 ps-[4.25rem] backdrop-blur sm:px-6 sm:ps-[4.75rem] lg:px-8 lg:ps-20">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
            <div>
              <h1 id="aw7-review-title" className="text-xl font-semibold">{tr("review.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("review.progress", {
                  completed: review.completedSets,
                  total: review.totalSets
                })}
              </p>
            </div>
            <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold">
              {formatters.ratio(review.completedSets, review.totalSets)}
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-40 pt-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <main className="min-w-0 space-y-4">
              {review.incompleteSets > 0 || review.skippedExercises > 0 ? (
                <section
                  data-aw7-incomplete-warning
                  className="rounded-[18px] border border-warning/35 bg-warning/5 p-4"
                  aria-labelledby="aw7-incomplete-title"
                >
                  <h2 id="aw7-incomplete-title" className="font-semibold">{tr("review.incompleteTitle")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tr("review.incompleteSummary", {
                      exercises: review.incompleteExercises,
                      sets: review.incompleteSets,
                      skipped: review.skippedExercises
                    })}
                  </p>
                </section>
              ) : null}

              <section aria-labelledby="aw7-exercise-review-title">
                <h2 id="aw7-exercise-review-title" className="sr-only">{tr("review.exerciseBreakdown")}</h2>
                <div className="space-y-3">
                  {review.exercises.map((exercise) => {
                    const isExpanded = expanded[exercise.exerciseIndex] ?? true;
                    return (
                      <article
                        key={`${exercise.exerciseIndex}-${exercise.currentName}`}
                        data-aw7-review-exercise
                        data-status={exercise.status}
                        className="rounded-[18px] border border-border/70 bg-card"
                      >
                        <button
                          type="button"
                          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[18px] px-4 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-expanded={isExpanded}
                          onClick={() => setExpanded((current) => ({
                            ...current,
                            [exercise.exerciseIndex]: !isExpanded
                          }))}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold"><bdi>{exercise.currentName}</bdi></span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {tr("review.exerciseSetProgress", {
                                completed: exercise.completedSets,
                                total: exercise.totalSets
                              })} · {tr(`review.status.${exercise.status}`)}
                            </span>
                            {exercise.originalName ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {tr("review.replacedFrom", { name: isolateBidiText(exercise.originalName) })}
                              </span>
                            ) : null}
                          </span>
                          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                        </button>
                        {isExpanded ? (
                          <div className="border-t border-border/70 px-3 py-2 sm:px-4">
                            <div className="divide-y divide-border/60">
                              {exercise.sets.map((set, setIndex) => (
                                <div
                                  key={set.setNumber}
                                  data-aw7-review-set
                                  data-completed={set.completed ? "true" : "false"}
                                  className="grid gap-2 py-3 sm:grid-cols-[minmax(7rem,1fr)_minmax(0,2fr)_auto] sm:items-center"
                                >
                                  <div className="flex items-center gap-2 text-sm font-semibold">
                                    {set.completed
                                      ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                                      : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                                    <span>{tr("set.label", { count: formatters.integer(set.setNumber) })}</span>
                                    <span className="sr-only">{set.completed ? tr("navigation.completed") : tr("review.incomplete")}</span>
                                  </div>
                                  <div dir="ltr" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span>{tr("set.reps")}: {set.reps || "-"}</span>
                                    <span>{tr("set.weightKg")}: {set.weightKg || "-"}</span>
                                    <span>RPE: {set.rpe || "-"}</span>
                                    <span>RIR: {set.rir || "-"}</span>
                                    <span>{tr("review.setType")}: {tr(`review.setTypes.${set.setType}`)}</span>
                                    {set.notes ? <span>{tr("review.noteSaved")}</span> : null}
                                    <span>{set.pending ? tr("review.pending") : set.persisted ? tr("review.persisted") : tr("review.notSaved")}</span>
                                  </div>
                                  {exercise.status !== "skipped" ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="min-h-10 justify-self-start sm:justify-self-end"
                                      onClick={() => set.completed
                                        ? onReopenSet(exercise.exerciseIndex, setIndex)
                                        : onJumpToSet(exercise.exerciseIndex, setIndex)}
                                      disabled={busy}
                                    >
                                      {set.completed ? tr("review.reopenSet") : tr("review.jumpToSet")}
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            </main>

            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <section className="rounded-[18px] border border-border/70 bg-card p-4">
                <h2 className="font-semibold">{tr("review.workoutNote")}</h2>
                <Label htmlFor="finish-notes" className="sr-only">{tr("review.workoutNote")}</Label>
                <textarea
                  id="finish-notes"
                  dir="auto"
                  className="mt-3 min-h-28 w-full resize-y rounded-[14px] border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={sessionNotes}
                  onChange={(event) => onSessionNotesChange(event.target.value)}
                  placeholder={tr("review.optionalNote")}
                  disabled={busy}
                />
              </section>
              <section className="rounded-[18px] border border-border/70 bg-card p-4">
                <h2 className="font-semibold">{tr("review.finalSummary")}</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <InfoStat label={tr("review.minutes")} value={formatters.measurement(durationMinutes, "minutes", 0)} />
                  <InfoStat label={tr("review.volume")} value={formatters.measurement(totalVolume, "kg")} />
                  <InfoStat label={tr("review.completedExercises")} value={formatters.integer(review.completedExercises)} />
                  <InfoStat label={tr("review.personalRecords")} value={formatters.integer(previewPrs.length)} />
                </div>
              </section>
              {completionRecovery !== "none" ? (
                <section className="rounded-[18px] border border-destructive/30 bg-destructive/5 p-4" role="status">
                  <h2 className="font-semibold">{tr("completion.recoveryTitle")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {completionRecovery === "reconnect"
                      ? tr("completion.reconnectDescription")
                      : tr("completion.retryDescription")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 min-h-11 w-full"
                    onClick={onRetryCompletion}
                    disabled={busy}
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                    {tr("common.retry")}
                  </Button>
                </section>
              ) : null}
            </aside>
          </div>
        </div>

        <footer
          data-aw7-review-actions
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur"
        >
          <div className="mx-auto flex max-w-6xl flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-[52px] sm:min-w-44" onClick={onContinue} disabled={busy}>
              {tr("review.continueWorkout")}
            </Button>
            <Button
              type="button"
              className="min-h-[52px] sm:min-w-44"
              onClick={finish}
              disabled={busy || !sessionAvailable}
              aria-busy={busy}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {review.incompleteSets > 0 ? tr("review.partialFinish") : tr("review.saveAndFinish")}
            </Button>
          </div>
        </footer>
      </section>

      <Dialog
        open={partialConfirmOpen}
        onOpenChange={(next) => {
          setPartialConfirmOpen(next);
          if (next) window.requestAnimationFrame(() => partialConfirmRef.current?.focus());
        }}
      >
        <DialogContent
          data-aw7-partial-confirmation
          className="sm:max-w-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            partialConfirmRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {tr("review.finishWithIncomplete", { count: review.incompleteSets })}
            </DialogTitle>
            <DialogDescription>
              {tr("review.incompleteSummary", {
                exercises: review.incompleteExercises,
                sets: review.incompleteSets,
                skipped: review.skippedExercises
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setPartialConfirmOpen(false)} disabled={busy}>
              {tr("review.continueWorkout")}
            </Button>
            <Button
              ref={partialConfirmRef}
              type="button"
              className="min-h-12"
              onClick={() => {
                setPartialConfirmOpen(false);
                onComplete();
              }}
              disabled={busy}
            >
              {tr("review.finishAnyway")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
