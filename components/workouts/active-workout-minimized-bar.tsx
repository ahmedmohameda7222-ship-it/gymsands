"use client";

import Link from "next/link";
import { CirclePause, CirclePlay, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExerciseLog, WorkoutSessionPrescriptionItem } from "@/types";

export type ActiveWorkoutMinimizedBarState =
  | "active"
  | "rest"
  | "paused"
  | "review"
  | "error";

export type ActiveWorkoutMinimizedBarProps = {
  state: ActiveWorkoutMinimizedBarState;
  href: string;
  title: string;
  meta: string;
  timer: string | null;
  progress: number;
  openLabel: string;
  actionLabel: string;
  actionPending: boolean;
  onAction?: () => void;
};

export function activeWorkoutPrescriptionSetCount(
  item: WorkoutSessionPrescriptionItem | null
) {
  return item?.prescriptionSets.length || item?.plannedSets || 1;
}

function completedLogMatchesItem(
  log: ExerciseLog,
  item: WorkoutSessionPrescriptionItem
) {
  if (log.plan_exercise_id && item.sourcePlanExerciseId) {
    return log.plan_exercise_id === item.sourcePlanExerciseId;
  }
  if (log.plan_activity_id && item.sourcePlanActivityId) {
    return log.plan_activity_id === item.sourcePlanActivityId;
  }
  if (Number.isSafeInteger(log.exercise_order)) {
    return log.exercise_order === item.itemOrder;
  }
  return false;
}

export function projectActiveWorkoutMinimizedProgress(
  prescription: readonly WorkoutSessionPrescriptionItem[],
  logs: readonly ExerciseLog[]
) {
  const activeItems = prescription.filter((item) => item.executionState !== "skipped");
  const totalSetCount = activeItems.reduce(
    (sum, item) => sum + activeWorkoutPrescriptionSetCount(item),
    0
  );
  const hasSkippedItems = activeItems.length !== prescription.length;
  const completedSetCount = Math.min(
    totalSetCount,
    logs.filter((log) => {
      if (!log.completed_at) return false;
      const hasStableIdentity = Boolean(
        log.plan_exercise_id
        || log.plan_activity_id
        || Number.isSafeInteger(log.exercise_order)
      );
      if (!hasSkippedItems || !hasStableIdentity) return !hasSkippedItems;
      return activeItems.some((item) => completedLogMatchesItem(log, item));
    }).length
  );
  return {
    totalSetCount,
    completedSetCount,
    progress: totalSetCount > 0 ? completedSetCount / totalSetCount : 0
  };
}

export function ActiveWorkoutMinimizedBar({
  state,
  href,
  title,
  meta,
  timer,
  progress,
  openLabel,
  actionLabel,
  actionPending,
  onAction
}: ActiveWorkoutMinimizedBarProps) {
  const progressPercent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const actionIcon = state === "paused"
    ? <CirclePlay className="h-4 w-4" aria-hidden="true" />
    : state === "active"
      ? <CirclePause className="h-4 w-4" aria-hidden="true" />
      : state === "error"
        ? <RefreshCcw className={cn("h-4 w-4", actionPending && "motion-safe:animate-spin")} aria-hidden="true" />
        : null;

  return (
    <section
      data-active-workout-minimized-bar
      data-active-workout-minimized-state={state}
      aria-label={openLabel}
      className="relative min-h-[4.5rem] overflow-hidden rounded-[18px] border border-primary/25 bg-card/95 shadow-xl backdrop-blur"
    >
      <div className="flex min-h-[4.5rem] items-center gap-2.5 px-3 pb-2 pt-2">
        <Link
          href={href}
          prefetch={false}
          className="min-w-0 flex-1 rounded-xl px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={openLabel}
        >
          <p className="truncate text-sm font-semibold leading-5">
            <bdi>{title}</bdi>
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
            <span className="truncate">{meta}</span>
            {timer ? (
              <>
                <span aria-hidden="true">·</span>
                <span dir="ltr" className="shrink-0 tabular-nums">{timer}</span>
              </>
            ) : null}
          </p>
        </Link>
        {onAction ? (
          <Button
            type="button"
            variant={state === "active" ? "outline" : "default"}
            size="sm"
            className="relative z-10 min-h-11 shrink-0 px-3"
            onClick={onAction}
            disabled={actionPending}
            aria-label={actionLabel}
          >
            {actionIcon}
            <span>{actionLabel}</span>
          </Button>
        ) : (
          <Button asChild size="sm" className="relative z-10 min-h-11 shrink-0 px-3">
            <Link href={href} prefetch={false} aria-label={actionLabel}>
              {actionLabel}
            </Link>
          </Button>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        className="absolute inset-x-0 bottom-0 h-1 bg-muted"
      >
        <div
          className="h-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </section>
  );
}
