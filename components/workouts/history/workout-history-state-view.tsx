"use client";

import { AlertTriangle, CloudOff } from "lucide-react";

import { EmptyState, ErrorState, SkeletonLine } from "@/components/ui/state-views";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryListNotice } from "@/types/workout-history";

export type WorkoutHistoryPageState =
  | "initial-loading"
  | "ready"
  | "empty"
  | "period-empty"
  | "search-empty"
  | "filtered-empty"
  | "search-filter-empty"
  | "blocking-error";

export function WorkoutHistoryStateView({
  state,
  notice,
  onRetry,
  onClearFilters,
  onClearSearch = onClearFilters,
  onClearSearchAndFilters = onClearFilters,
}: {
  state: WorkoutHistoryPageState;
  notice?: WorkoutHistoryListNotice | "user-action-required" | null;
  onRetry: () => void;
  onClearFilters: () => void;
  onClearSearch?: () => void;
  onClearSearchAndFilters?: () => void;
}) {
  const { tr } = useTrainTranslation();
  if (state === "initial-loading") {
    return (
      <div className="space-y-2" aria-busy="true" aria-label={tr("historyLoadingLabel")}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="border-b border-border/70 py-4">
            <SkeletonLine className="h-5 w-2/3" />
            <SkeletonLine className="mt-2 h-3 w-24" />
            <SkeletonLine className="mt-3 h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  if (state === "empty") return <EmptyState title={tr("historyEmptyTitle")} description={tr("historyEmptyDescription")} actionLabel={tr("historyStartWorkout")} actionHref="/my-workout" secondaryLabel={tr("historyCreatePlan")} secondaryHref="/my-workout/plans/builder" />;
  if (state === "period-empty") return <EmptyState title={tr("historyPeriodEmptyTitle")} description={tr("historyPeriodEmptyDescription")} />;
  if (state === "search-empty") return <EmptyState title={tr("historySearchEmptyTitle")} description={tr("historySearchEmptyDescription")} actionLabel={tr("historyClearSearch")} onAction={onClearSearch} />;
  if (state === "filtered-empty") return <EmptyState title={tr("historyFilteredEmptyTitle")} description={tr("historyFilteredEmptyDescription")} actionLabel={tr("historyClearFilters")} onAction={onClearFilters} />;
  if (state === "search-filter-empty") return <EmptyState title={tr("historySearchFilterEmptyTitle")} description={tr("historySearchFilterEmptyDescription")} actionLabel={tr("historyClearSearchAndFilters")} onAction={onClearSearchAndFilters} />;
  if (state === "blocking-error") return <ErrorState title={tr("historyLoadFailedTitle")} description={tr("historyLoadFailedDescription")} retryLabel={tr("historyRetry")} onRetry={onRetry} />;
  if (!notice) return null;
  const copy = notice === "stale-data" ? tr("historyStaleNotice") : notice === "partial-availability" ? tr("historyPartialNotice") : tr("historyActionRequiredNotice");
  const Icon = notice === "stale-data" ? CloudOff : AlertTriangle;
  return (
    <div className="flex items-start gap-2 border-y border-border/70 py-3 text-sm text-muted-foreground" role="status">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{copy}</p>
    </div>
  );
}
