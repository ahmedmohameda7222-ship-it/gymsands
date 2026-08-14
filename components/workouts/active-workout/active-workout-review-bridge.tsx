"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Circle, RefreshCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import type { ActiveWorkoutMuscleLoadController } from "./active-workout-muscle-load-controller";

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

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-s border-border ps-3">
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CompletionSurface({
  summary,
  dayName,
  tr,
  formatters
}: {
  summary: ActiveWorkoutSummary;
  dayName: string;
  tr: ActiveWorkoutTranslator;
  formatters: ActiveWorkoutFormatters;
}) {
  return (
    <div data-aw5-completed-summary data-aw7-completed-summary data-aw10-terminal-completion className="mx-auto w-full max-w-2xl">
      <div className="border-b border-border/70 pb-6">
        <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
        <h1 id="aw5-completed-summary-title" className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">
          {tr("completion.dayComplete", { day: isolateBidiText(dayName) })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{tr("completion.savedHistory")}</p>
      </div>

      <div className="grid grid-cols-2 gap-5 border-b border-border/70 py-6 sm:grid-cols-3">
        <SummaryFact label={tr("review.minutes")} value={formatters.measurement(summary.durationMinutes, "minutes", 0)} />
        <SummaryFact label={tr("review.completedSets")} value={formatters.ratio(summary.completedSets, summary.totalPlannedSets)} />
        <SummaryFact label={tr("review.completedExercises")} value={formatters.integer(summary.completedExercises)} />
      </div>

      {(summary.partialExercises.length || summary.skippedExercises.length || summary.replacedExercises.length) ? (
        <section className="border-b border-border/70 py-5">
          <h2 className="text-sm font-semibold text-foreground">{tr("completion.workSummary")}</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {summary.partialExercises.map((name) => <li key={`partial-${name}`}>{tr("completion.partialExercise", { name: isolateBidiText(name) })}</li>)}
            {summary.skippedExercises.map((name) => <li key={`skipped-${name}`}>{tr("completion.skippedExercise", { name: isolateBidiText(name) })}</li>)}
            {summary.replacedExercises.map((item) => (
              <li key={`${item.originalName}-${item.currentName}`}>{tr("completion.replacedExercise", { original: isolateBidiText(item.originalName), current: isolateBidiText(item.currentName) })}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.notes ? (
        <section className="border-b border-border/70 py-5">
          <h2 className="text-sm font-semibold text-foreground">{tr("review.workoutNote")}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{summary.notes}</p>
        </section>
      ) : null}

      <section data-aw10-pr-post-save-only className="py-5" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          {/* The old locally-derived summary.prs is intentionally not rendered. Canonical
              Personal Records are a post-terminal, fail-soft authority and pending is
              never represented as a fabricated zero. */}
          {tr("completion.savedHistory")}
        </p>
      </section>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button asChild className="min-h-12 sm:min-w-44">
          <Link href="/dashboard" prefetch={false}>{tr("completion.backToToday")}</Link>
        </Button>
      </div>
    </div>
  );
}

export function ActiveWorkoutReviewBridge({
  open,
  busy,
  sessionAvailable,
  durationMinutes,
  totalVolume,
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
    const restored: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null; visibility: string }> = [];
    let branch: HTMLElement = surface;
    while (branch !== document.body) {
      const parent = branch.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        restored.push({ element: sibling, inert: sibling.inert, ariaHidden: sibling.getAttribute("aria-hidden"), visibility: sibling.style.visibility });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
        sibling.style.visibility = "hidden";
      }
      branch = parent;
    }
    surface.focus();
    return () => {
      for (const item of restored) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden"); else item.element.setAttribute("aria-hidden", item.ariaHidden);
        item.element.style.visibility = item.visibility;
      }
    };
  }, [completedSummary]);

  if (completedSummary) {
    return (
      <div ref={completionSurfaceRef} data-aw5-completion-surface data-aw7-completion-surface role="main" aria-labelledby="aw5-completed-summary-title" tabIndex={-1} className="fixed inset-0 z-[70] overflow-y-auto bg-background outline-none">
        <div className="mx-auto flex min-h-dvh w-full items-center px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:py-10">
          <CompletionSurface summary={completedSummary} dayName={dayName} tr={tr} formatters={formatters} />
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
      <section data-aw5-session-review data-aw7-review-surface data-aw10-review-no-pr-preview aria-labelledby="aw7-review-title" className="fixed inset-0 z-[35] flex min-h-0 flex-col bg-background">
        <header className="border-b border-border/70 bg-background px-4 py-4 pe-4 ps-[4.25rem] sm:px-6 sm:ps-[4.75rem]">
          <div className="mx-auto max-w-3xl">
            <h1 id="aw7-review-title" className="text-xl font-semibold">{tr("review.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tr("review.progress", { completed: review.completedSets, total: review.totalSets })}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-40 pt-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl space-y-4">
            {review.incompleteSets > 0 || review.skippedExercises > 0 ? (
              <section data-aw7-incomplete-warning className="border-s-2 border-warning bg-warning/5 p-4" aria-labelledby="aw7-incomplete-title">
                <h2 id="aw7-incomplete-title" className="font-semibold">{tr("review.incompleteTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{tr("review.incompleteSummary", { exercises: review.incompleteExercises, sets: review.incompleteSets, skipped: review.skippedExercises })}</p>
              </section>
            ) : null}

            <section aria-labelledby="aw7-exercise-review-title">
              <h2 id="aw7-exercise-review-title" className="sr-only">{tr("review.exerciseBreakdown")}</h2>
              <div className="divide-y divide-border/70 border-y border-border/70">
                {review.exercises.map((exercise) => {
                  const isExpanded = expanded[exercise.exerciseIndex] ?? false;
                  return (
                    <article key={`${exercise.exerciseIndex}-${exercise.currentName}`} data-aw7-review-exercise data-status={exercise.status}>
                      <button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={isExpanded} onClick={() => setExpanded((current) => ({ ...current, [exercise.exerciseIndex]: !isExpanded }))}>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold"><bdi>{exercise.currentName}</bdi></span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{tr("review.exerciseSetProgress", { completed: exercise.completedSets, total: exercise.totalSets })} · {tr(`review.status.${exercise.status}`)}</span>
                        </span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                      </button>
                      {isExpanded ? (
                        <div className="border-t border-border/60 pb-2">
                          {exercise.sets.map((set, setIndex) => (
                            <div key={set.setNumber} data-aw7-review-set data-completed={set.completed ? "true" : "false"} className="grid gap-2 border-b border-border/50 py-3 last:border-b-0 sm:grid-cols-[minmax(7rem,1fr)_minmax(0,2fr)_auto] sm:items-center">
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                {set.completed ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                                <span>{tr("set.label", { count: formatters.integer(set.setNumber) })}</span>
                              </div>
                              <div dir="ltr" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>{tr("set.reps")}: {set.reps || "-"}</span>
                                <span>{tr("set.weightKg")}: {set.weightKg || "-"}</span>
                                <span>RPE: {set.rpe || "-"}</span>
                                <span>RIR: {set.rir || "-"}</span>
                              </div>
                              {exercise.status !== "skipped" ? (
                                <Button type="button" variant="outline" size="sm" className="min-h-10 justify-self-start sm:justify-self-end" onClick={() => set.completed ? onReopenSet(exercise.exerciseIndex, setIndex) : onJumpToSet(exercise.exerciseIndex, setIndex)} disabled={busy}>
                                  {set.completed ? tr("review.reopenSet") : tr("review.jumpToSet")}
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="pt-2">
              <h2 className="font-semibold">{tr("review.workoutNote")}</h2>
              <Label htmlFor="finish-notes" className="sr-only">{tr("review.workoutNote")}</Label>
              <textarea id="finish-notes" dir="auto" className="mt-3 min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={sessionNotes} onChange={(event) => onSessionNotesChange(event.target.value)} placeholder={tr("review.optionalNote")} disabled={busy} />
            </section>

            <section className="grid grid-cols-2 gap-4 border-y border-border/70 py-4 sm:grid-cols-3">
              <SummaryFact label={tr("review.minutes")} value={formatters.measurement(durationMinutes, "minutes", 0)} />
              <SummaryFact label={tr("review.volume")} value={formatters.measurement(totalVolume, "kg")} />
              <SummaryFact label={tr("review.completedExercises")} value={formatters.integer(review.completedExercises)} />
            </section>

            {completionRecovery !== "none" ? (
              <section className="border-s-2 border-destructive bg-destructive/5 p-4" role="status">
                <h2 className="font-semibold">{tr("completion.recoveryTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{completionRecovery === "reconnect" ? tr("completion.reconnectDescription") : tr("completion.retryDescription")}</p>
                <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={onRetryCompletion} disabled={busy}><RefreshCcw className="h-4 w-4" aria-hidden="true" />{tr("common.retry")}</Button>
              </section>
            ) : null}
          </div>
        </div>

        <footer data-aw7-review-actions className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-[52px] sm:min-w-44" onClick={onContinue} disabled={busy}>{tr("review.continueWorkout")}</Button>
            <Button type="button" className="min-h-[52px] sm:min-w-44" onClick={finish} disabled={busy || !sessionAvailable} aria-busy={busy}><Save className="h-4 w-4" aria-hidden="true" />{review.incompleteSets > 0 ? tr("review.partialFinish") : tr("review.saveAndFinish")}</Button>
          </div>
        </footer>
      </section>

      <Dialog open={partialConfirmOpen} onOpenChange={(next) => { setPartialConfirmOpen(next); if (next) window.requestAnimationFrame(() => partialConfirmRef.current?.focus()); }}>
        <DialogContent data-aw7-partial-confirmation className="sm:max-w-md" onOpenAutoFocus={(event) => { event.preventDefault(); partialConfirmRef.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>{tr("review.finishWithIncomplete", { count: review.incompleteSets })}</DialogTitle>
            <DialogDescription>{tr("review.incompleteSummary", { exercises: review.incompleteExercises, sets: review.incompleteSets, skipped: review.skippedExercises })}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setPartialConfirmOpen(false)} disabled={busy}>{tr("review.continueWorkout")}</Button>
            <Button ref={partialConfirmRef} type="button" className="min-h-12" onClick={() => { setPartialConfirmOpen(false); onComplete(); }} disabled={busy}>{tr("review.finishAnyway")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
