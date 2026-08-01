"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { WorkoutHistoryFilters, type WorkoutHistoryFilterValue } from "@/components/workouts/history/workout-history-filters";
import { WorkoutHistoryHeader } from "@/components/workouts/history/workout-history-header";
import { WorkoutHistoryLoadMore } from "@/components/workouts/history/workout-history-load-more";
import { WorkoutHistoryPeriodControl } from "@/components/workouts/history/workout-history-period-control";
import { WorkoutHistorySearch } from "@/components/workouts/history/workout-history-search";
import { WorkoutHistoryStateView, type WorkoutHistoryPageState } from "@/components/workouts/history/workout-history-state-view";
import { WorkoutHistorySummary } from "@/components/workouts/history/workout-history-summary";
import { WorkoutHistoryTimeline } from "@/components/workouts/history/workout-history-timeline";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";
import {
  customWorkoutHistoryPeriodRange,
  shiftWorkoutHistoryPeriodAnchor,
  workoutHistoryPeriodRange,
  type WorkoutHistoryDateRange,
  type WorkoutHistoryPeriodMode,
} from "@/lib/workouts/history/date-range";
import { getWorkoutHistoryList } from "@/services/workouts/history/client";
import type { WorkoutHistoryListResponse } from "@/types/workout-history";

const defaultFilters: WorkoutHistoryFilterValue = {
  statuses: ["completed", "partial"],
  progressOnly: false,
};

function inputDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function WorkoutHistoryPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { dir } = useTrainTranslation();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [mode, setMode] = useState<WorkoutHistoryPeriodMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [customFrom, setCustomFrom] = useState(() => inputDate(new Date()));
  const [customTo, setCustomTo] = useState(() => inputDate(new Date()));
  const [customRange, setCustomRange] = useState<WorkoutHistoryDateRange | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [response, setResponse] = useState<WorkoutHistoryListResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [blockingError, setBlockingError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const queryKeyRef = useRef("");
  const hasUsableResponseRef = useRef(false);

  const range = useMemo(() => {
    if (mode === "custom" && customRange) return customRange;
    return workoutHistoryPeriodRange(mode === "custom" ? "month" : mode, anchor, timezone);
  }, [anchor, customRange, mode, timezone]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.normalize("NFKC").replace(/\s+/g, " ").trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const request = useMemo(() => ({
    ...range,
    limit: 20,
    search: search || undefined,
    statuses: filters.statuses,
    progressOnly: filters.progressOnly || undefined,
    sort: "newest" as const,
  }), [filters.progressOnly, filters.statuses, range, search]);
  const queryKey = useMemo(() => JSON.stringify(request), [request]);
  const nextCursor = response?.nextCursor ?? null;

  useEffect(() => {
    hasUsableResponseRef.current = Boolean(response?.items.length);
  }, [response?.items.length]);

  const loadFirstPage = useCallback(async () => {
    if (!userId) return;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const queryChanged = queryKeyRef.current !== queryKey;
    queryKeyRef.current = queryKey;
    if (queryChanged) {
      setResponse(null);
      setInitialLoading(true);
    }
    setBlockingError(false);
    setLoadMoreError(false);
    try {
      const next = await getWorkoutHistoryList(userId, request, { signal: controller.signal });
      if (!controller.signal.aborted) setResponse(next);
    } catch {
      if (!controller.signal.aborted) setBlockingError(!hasUsableResponseRef.current);
    } finally {
      if (!controller.signal.aborted) setInitialLoading(false);
    }
  }, [queryKey, request, userId]);

  useEffect(() => {
    void loadFirstPage();
    return () => activeRequestRef.current?.abort();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!userId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const next = await getWorkoutHistoryList(userId, {
        ...request,
        cursor: nextCursor,
      });
      setResponse((current) => current ? {
        ...next,
        summary: current.summary,
        items: [...current.items, ...next.items.filter((candidate) =>
          !current.items.some((item) => item.activityId === candidate.activityId))],
      } : next);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, request, userId]);

  const hasFilters = search.length > 0
    || filters.progressOnly
    || filters.statuses.length !== defaultFilters.statuses.length
    || filters.statuses.some((status) => !defaultFilters.statuses.includes(status));
  let pageState: WorkoutHistoryPageState = "ready";
  if (initialLoading && !response) pageState = "initial-loading";
  else if (blockingError && !response?.items.length) pageState = "blocking-error";
  else if (!response?.items.length) pageState = hasFilters ? "filtered-empty" : "empty";
  const visibleNotice = response?.notices.includes("stale-data")
    ? "stale-data"
    : response?.notices.includes("partial-availability")
      ? "partial-availability"
      : null;

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setFilters(defaultFilters);
    setFiltersOpen(false);
  }

  function selectMode(nextMode: WorkoutHistoryPeriodMode) {
    setMode(nextMode);
    if (nextMode !== "custom") setCustomRange(null);
  }

  function applyCustomRange() {
    try {
      setCustomRange(customWorkoutHistoryPeriodRange(customFrom, customTo, timezone));
    } catch {
      setCustomRange(null);
    }
  }

  return (
    <TrainPageContainer className="space-y-4 pb-8" dir={dir} withGutters data-workout-history-page>
      <WorkoutHistoryHeader />
      <WorkoutHistoryPeriodControl
        mode={mode}
        range={range}
        customFrom={customFrom}
        customTo={customTo}
        onModeChange={selectMode}
        onPrevious={() => setAnchor((current) => shiftWorkoutHistoryPeriodAnchor(current, mode === "custom" ? "month" : mode, -1))}
        onNext={() => setAnchor((current) => shiftWorkoutHistoryPeriodAnchor(current, mode === "custom" ? "month" : mode, 1))}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onApplyCustom={applyCustomRange}
      />

      {pageState === "ready" && response ? (
        <WorkoutHistorySummary
          summary={response.summary}
          periodDays={Math.max(1, (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000)}
        />
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <WorkoutHistorySearch value={searchInput} onChange={setSearchInput} />
        <WorkoutHistoryFilters
          open={filtersOpen}
          value={filters}
          resultCount={response?.summary.eligibleWorkoutCount ?? null}
          onOpenChange={setFiltersOpen}
          onChange={setFilters}
          onClear={clearFilters}
        />
      </div>

      <WorkoutHistoryStateView
        state={pageState}
        notice={pageState === "ready" ? visibleNotice : null}
        onRetry={loadFirstPage}
        onClearFilters={clearFilters}
      />

      {pageState === "ready" && response ? (
        <>
          <WorkoutHistoryTimeline items={response.items} timezone={range.timezone} />
          {response.nextCursor || loadMoreError ? (
            <WorkoutHistoryLoadMore loading={loadingMore} error={loadMoreError} onLoadMore={loadMore} />
          ) : null}
        </>
      ) : null}
    </TrainPageContainer>
  );
}
