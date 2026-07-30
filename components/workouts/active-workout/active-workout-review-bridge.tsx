"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Dumbbell, Save, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MotionCard } from "@/components/motion";
import type {
  ActiveWorkoutFormatters,
  ActiveWorkoutTranslator,
} from "@/lib/i18n/active-workout";
import { isolateBidiText } from "@/lib/i18n/active-workout";

import type { ActiveWorkoutSummary } from "./active-workout-runtime-model";

export type ActiveWorkoutReviewBridgeProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  sessionAvailable: boolean;
  durationMinutes: number;
  completedSets: number;
  totalSets: number;
  totalVolume: number;
  previewPrs: readonly string[];
  sessionNotes: string;
  onSessionNotesChange: (value: string) => void;
  onComplete: () => void;
  completedSummary: ActiveWorkoutSummary | null;
  dayName: string;
  tr: ActiveWorkoutTranslator;
  formatters: ActiveWorkoutFormatters;
};

function InfoStat({
  label,
  value,
  valueDirection = "auto",
}: {
  label: string;
  value: string;
  valueDirection?: "auto" | "ltr";
}) {
  return (
    <div className="rounded-[16px] border border-border/60 bg-muted/30 p-3 text-center">
      <p
        dir={valueDirection}
        className="text-lg font-bold tracking-[-0.03em] tabular-nums"
      >
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
  tr,
  formatters,
}: {
  summary: ActiveWorkoutSummary;
  dayName: string;
  tr: ActiveWorkoutTranslator;
  formatters: ActiveWorkoutFormatters;
}) {
  return (
    <div data-aw5-completed-summary>
      <MotionCard>
        <Card className="rounded-[28px] border-success/20 bg-success/[0.04]">
          <CardContent className="space-y-5 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <Dumbbell className="h-5 w-5 text-success" aria-hidden="true" />
              </div>
              <div>
                <h1
                  id="aw5-completed-summary-title"
                  className="text-base font-semibold"
                >
                  {tr("completion.dayComplete", {
                    day: isolateBidiText(dayName),
                  })}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {tr("completion.savedHistory")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <InfoStat
                label={tr("review.minutes")}
                value={formatters.measurement(
                  summary.durationMinutes,
                  "minutes",
                  0,
                )}
              />
              <InfoStat
                label={tr("review.volume")}
                value={formatters.measurement(summary.totalVolume, "kg")}
              />
              <InfoStat
                label={tr("set.labelPlural")}
                value={formatters.integer(summary.completedSets)}
              />
              <InfoStat
                label={tr("navigation.exercises")}
                value={formatters.integer(summary.completedExercises)}
              />
              <InfoStat
                label={tr("navigation.partial")}
                value={formatters.integer(summary.partialExercises.length)}
              />
            </div>
            {summary.prs.length ? (
              <div className="rounded-[16px] border border-primary/20 bg-primary/[0.04] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  {tr("completion.newPrs", { count: summary.prs.length })}
                </p>
                <ul className="mt-2 space-y-1">
                  {summary.prs.slice(0, 4).map((pr) => (
                    <li key={pr} className="text-sm text-muted-foreground">
                      - {pr}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button asChild className="min-h-12 w-full rounded-[18px]">
              <Link href="/my-workout/plans" prefetch={false}>
                {tr("completion.backToWorkouts")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </MotionCard>
    </div>
  );
}

export function ActiveWorkoutReviewBridge({
  open,
  onOpenChange,
  busy,
  sessionAvailable,
  durationMinutes,
  completedSets,
  totalSets,
  totalVolume,
  previewPrs,
  sessionNotes,
  onSessionNotesChange,
  onComplete,
  completedSummary,
  dayName,
  tr,
  formatters,
}: ActiveWorkoutReviewBridgeProps) {
  const completionSurfaceRef = useRef<HTMLDivElement>(null);

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
    const restoredLandmarks: Array<{
      element: HTMLElement;
      role: string | null;
    }> = [];
    let branch: HTMLElement = surface;

    while (branch !== document.body) {
      const parent = branch.parentElement;
      if (!parent) break;
      if (
        parent !== surface &&
        (parent.tagName === "MAIN" || parent.getAttribute("role") === "main")
      ) {
        restoredLandmarks.push({
          element: parent,
          role: parent.getAttribute("role"),
        });
        parent.setAttribute("role", "presentation");
      }
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        restored.push({
          element: sibling,
          inert: sibling.inert,
          ariaHidden: sibling.getAttribute("aria-hidden"),
          visibility: sibling.style.visibility,
        });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
        sibling.style.visibility = "hidden";
      }
      branch = parent;
    }

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        surface.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => !element.inert && element.getClientRects().length > 0,
      );
      if (!focusable.length) {
        event.preventDefault();
        surface.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === surface)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    surface.addEventListener("keydown", keepFocusInside);
    surface.focus();

    return () => {
      surface.removeEventListener("keydown", keepFocusInside);
      for (const item of restored) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null)
          item.element.removeAttribute("aria-hidden");
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
        role="main"
        aria-labelledby="aw5-completed-summary-title"
        tabIndex={-1}
        className="fixed inset-0 z-[60] overflow-y-auto bg-background outline-none"
      >
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl items-start px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:items-center lg:pb-[calc(2.5rem+env(safe-area-inset-bottom))] lg:pt-10">
          <div className="w-full">
            <WorkoutSummaryCard
              summary={completedSummary}
              dayName={dayName}
              tr={tr}
              formatters={formatters}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-aw5-session-review
        layout="responsive-drawer"
        closeLabel={tr("common.close")}
        className="p-5 lg:max-w-lg lg:rounded-[28px]"
      >
        <DialogHeader>
          <DialogTitle>{tr("review.finishQuestion")}</DialogTitle>
          <DialogDescription>
            {tr("review.finishDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoStat
            label={tr("review.minutes")}
            value={formatters.measurement(durationMinutes, "minutes", 0)}
          />
          <InfoStat
            label={tr("set.labelPlural")}
            value={formatters.ratio(completedSets, totalSets)}
            valueDirection="ltr"
          />
          <InfoStat
            label={tr("review.volume")}
            value={formatters.measurement(totalVolume, "kg")}
          />
          <InfoStat
            label={tr("review.personalRecords")}
            value={formatters.integer(previewPrs.length)}
          />
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="finish-notes">{tr("details.workoutNotes")}</Label>
          <textarea
            id="finish-notes"
            dir="auto"
            className="min-h-24 w-full resize-y rounded-[16px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={sessionNotes}
            onChange={(event) => onSessionNotesChange(event.target.value)}
            placeholder={tr("review.optionalNote")}
            disabled={busy}
          />
        </div>
        <Button
          className="mt-4 min-h-[52px] w-full"
          onClick={onComplete}
          disabled={busy || !sessionAvailable}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {tr("review.saveAndFinish")}
        </Button>
        <Button
          className="mt-2 min-h-[52px] w-full"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={busy}
        >
          {tr("review.continueWorkout")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
