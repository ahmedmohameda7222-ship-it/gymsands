"use client";

import { AlertTriangle, CloudOff } from "lucide-react";

import { EmptyState, ErrorState, SkeletonLine } from "@/components/ui/state-views";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryListNotice } from "@/types/workout-history";

export type WorkoutHistoryPageState =
  | "initial-loading"
  | "ready"
  | "empty"
  | "filtered-empty"
  | "blocking-error";

export function WorkoutHistoryStateView({
  state,
  notice,
  onRetry,
  onClearFilters,
}: {
  state: WorkoutHistoryPageState;
  notice?: WorkoutHistoryListNotice | "user-action-required" | null;
  onRetry: () => void;
  onClearFilters: () => void;
}) {
  const { tr } = useTrainTranslation();
  if (state === "initial-loading") {
    return (
      <div className="space-y-5" aria-busy="true" aria-label={tr("historyLoadingLabel")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-border/70 bg-card p-3">
              <SkeletonLine className="h-3 w-20" />
              <SkeletonLine className="mt-2 h-6 w-16" />
            </div>
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="min-h-[158px] rounded-[18px] border border-border/70 bg-card p-4">
            <SkeletonLine className="h-5 w-2/3" />
            <SkeletonLine className="mt-2 h-3 w-24" />
            <div className="mt-5 grid grid-cols-3 gap-2"><SkeletonLine /><SkeletonLine /><SkeletonLine /></div>
            <SkeletonLine className="mt-5 h-6 w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  if (state === "empty") {
    return (
      <EmptyState
        title={tr("historyEmptyTitle")}
        description={tr("historyEmptyDescription")}
        actionLabel={tr("historyStartWorkout")}
        actionHref="/my-workout"
        secondaryLabel={tr("historyCreatePlan")}
        secondaryHref="/my-workout/plans/builder"
      />
    );
  }
  if (state === "filtered-empty") {
    return (
      <EmptyState
        title={tr("historyFilteredEmptyTitle")}
        description={tr("historyFilteredEmptyDescription")}
        actionLabel={tr("historyClearFilters")}
        onAction={onClearFilters}
      />
    );
  }
  if (state === "blocking-error") {
    return (
      <ErrorState
        title={tr("historyLoadFailedTitle")}
        description={tr("historyLoadFailedDescription")}
        retryLabel={tr("historyRetry")}
        onRetry={onRetry}
      />
    );
  }
  if (!notice) return null;
  const copy = notice === "stale-data"
    ? tr("historyStaleNotice")
    : notice === "partial-availability"
      ? tr("historyPartialNotice")
      : tr("historyActionRequiredNotice");
  const Icon = notice === "stale-data" ? CloudOff : AlertTriangle;
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground" role="status">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{copy}</p>
    </div>
  );
}
