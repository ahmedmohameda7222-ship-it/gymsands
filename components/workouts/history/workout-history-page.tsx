"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { WorkoutHistoryDesktopPreview } from "@/components/workouts/history/workout-history-desktop-preview";
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
  workoutHistoryTimeZoneParts,
  workoutHistoryPeriodRange,
  type WorkoutHistoryDateRange,
  type WorkoutHistoryPeriodMode,
} from "@/lib/workouts/history/date-range";
import {
  parseWorkoutHistoryNavigationState,
  workoutHistoryNavigationSearchParams,
  type WorkoutHistoryNavigationState,
} from "@/lib/workouts/history/navigation-state";
import { WorkoutHistoryRequestGeneration } from "@/lib/workouts/history/request-generation";
import { getWorkoutHistoryList } from "@/services/workouts/history/client";
import type { WorkoutHistoryListResponse } from "@/types/workout-history";

const defaultFilters: WorkoutHistoryFilterValue = {
  statuses: ["completed", "partial"],
  progressOnly: false,
  workoutType: "",
  muscle: "",
  exercise: "",
  plan: "",
  sort: "newest",
};

function inputDate(value: Date, timezone: string): string {
  const parts = workoutHistoryTimeZoneParts(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function WorkoutHistoryPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { dir } = useTrainTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const initialNavigation = parseWorkoutHistoryNavigationState(searchParams, new Date(), timezone);
  const [mode, setMode] = useState<WorkoutHistoryPeriodMode>(initialNavigation.period);
  const [anchor, setAnchor] = useState(() => new Date(initialNavigation.range.from));
  const [customFrom, setCustomFrom] = useState(() => inputDate(new Date(initialNavigation.range.from), timezone));
  const [customTo, setCustomTo] = useState(() => inputDate(new Date(Date.parse(initialNavigation.range.to) - 1), timezone));
  const [customRange, setCustomRange] = useState<WorkoutHistoryDateRange | null>(initialNavigation.period === "custom" ? initialNavigation.range : null);
  const [searchInput, setSearchInput] = useState(initialNavigation.search);
  const [search, setSearch] = useState(initialNavigation.search);
  const [filters, setFilters] = useState<WorkoutHistoryFilterValue>({
    statuses: initialNavigation.statuses,
    progressOnly: initialNavigation.progressOnly,
    workoutType: initialNavigation.workoutType,
    muscle: initialNavigation.muscle,
    exercise: initialNavigation.exercise,
    plan: initialNavigation.plan,
    sort: initialNavigation.sort,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [response, setResponse] = useState<WorkoutHistoryListResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [blockingError, setBlockingError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const loadMoreRequestRef = useRef<AbortController | null>(null);
  const [requestGeneration] = useState(() => new WorkoutHistoryRequestGeneration());
  const queryKeyRef = useRef("");
  const hasUsableResponseRef = useRef(false);

  const range = useMemo(() => {
    if (mode === "custom" && customRange) return customRange;
    return workoutHistoryPeriodRange(mode === "custom" ? "month" : mode, anchor, timezone);
  }, [anchor, customRange, mode, timezone]);

  const request = useMemo(() => ({
    ...range,
    limit: 20,
    search: search || undefined,
    workoutTypes: filters.workoutType ? [filters.workoutType] : undefined,
    muscleIds: filters.muscle ? [filters.muscle] : undefined,
    exerciseIds: filters.exercise ? [filters.exercise] : undefined,
    planIds: filters.plan ? [filters.plan] : undefined,
    statuses: filters.statuses,
    progressOnly: filters.progressOnly || undefined,
    sort: filters.sort,
  }), [filters, range, search]);
  const queryKey = useMemo(() => JSON.stringify(request), [request]);
  const nextCursor = response?.nextCursor ?? null;

  useEffect(() => {
    hasUsableResponseRef.current = Boolean(response?.items.length);
  }, [response?.items.length]);

  const navigationState = useMemo<WorkoutHistoryNavigationState>(() => ({
    period: mode,
    range,
    search,
    workoutType: filters.workoutType,
    muscle: filters.muscle,
    exercise: filters.exercise,
    plan: filters.plan,
    statuses: filters.statuses,
    progressOnly: filters.progressOnly,
    sort: filters.sort,
    selected: searchParams.get("selected"),
  }), [filters, mode, range, search, searchParams]);

  const writeNavigation = useCallback((next: WorkoutHistoryNavigationState) => {
    const params = workoutHistoryNavigationSearchParams(next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput.normalize("NFKC").replace(/\s+/g, " ").trim();
      if (normalized === search) return;
      setSearch(normalized);
      writeNavigation({ ...navigationState, search: normalized });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [navigationState, search, searchInput, writeNavigation]);

  const urlKey = searchParams.toString();
  useEffect(() => {
    const restored = parseWorkoutHistoryNavigationState(new URLSearchParams(urlKey), new Date(), timezone);
    setMode(restored.period);
    setAnchor(new Date(restored.range.from));
    setCustomFrom(inputDate(new Date(restored.range.from), timezone));
    setCustomTo(inputDate(new Date(Date.parse(restored.range.to) - 1), timezone));
    setCustomRange(restored.period === "custom" ? restored.range : null);
    setSearchInput(restored.search);
    setSearch(restored.search);
    setFilters({
      statuses: restored.statuses,
      progressOnly: restored.progressOnly,
      workoutType: restored.workoutType,
      muscle: restored.muscle,
      exercise: restored.exercise,
      plan: restored.plan,
      sort: restored.sort,
    });
  }, [timezone, urlKey]);

  const loadFirstPage = useCallback(async () => {
    if (!userId) return;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    loadMoreRequestRef.current?.abort();
    const generation = requestGeneration.begin();
    const queryChanged = queryKeyRef.current !== queryKey;
    queryKeyRef.current = queryKey;
    if (queryChanged && !hasUsableResponseRef.current) setInitialLoading(true);
    setBlockingError(false);
    setLoadMoreError(false);
    try {
      const next = await getWorkoutHistoryList(userId, request, { signal: controller.signal });
      if (requestGeneration.accepts(generation, controller.signal)) setResponse(next);
    } catch {
      if (requestGeneration.accepts(generation, controller.signal)) setBlockingError(!hasUsableResponseRef.current);
    } finally {
      if (requestGeneration.accepts(generation, controller.signal)) setInitialLoading(false);
    }
  }, [queryKey, request, requestGeneration, userId]);

  useEffect(() => {
    void loadFirstPage();
    return () => activeRequestRef.current?.abort();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!userId || !nextCursor || loadingMore) return;
    const controller = new AbortController();
    loadMoreRequestRef.current?.abort();
    loadMoreRequestRef.current = controller;
    const generation = requestGeneration.current();
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const next = await getWorkoutHistoryList(userId, {
        ...request,
        cursor: nextCursor,
      }, { signal: controller.signal });
      if (!requestGeneration.accepts(generation, controller.signal)) return;
      setResponse((current) => current ? {
        ...next,
        summary: current.summary,
        filterOptions: current.filterOptions,
        items: [...current.items, ...next.items.filter((candidate) =>
          !current.items.some((item) => item.activityId === candidate.activityId))],
      } : next);
    } catch {
      if (requestGeneration.accepts(generation, controller.signal)) setLoadMoreError(true);
    } finally {
      if (requestGeneration.accepts(generation, controller.signal)) setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, request, requestGeneration, userId]);

  const hasFilters = search.length > 0
    || filters.progressOnly
    || filters.workoutType.length > 0
    || filters.muscle.length > 0
    || filters.exercise.length > 0
    || filters.plan.length > 0
    || filters.sort !== defaultFilters.sort
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
  const selectedId = searchParams.get("selected");
  const selectedItem = response?.items.find((item) => item.activityId === selectedId) ?? null;
  const periodDays = Math.max(1, (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000);

  const selectDesktopItem = useCallback((item: WorkoutHistoryListResponse["items"][number]) => {
    writeNavigation({ ...navigationState, selected: item.activityId });
  }, [navigationState, writeNavigation]);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setFilters(defaultFilters);
    setFiltersOpen(false);
    writeNavigation({
      ...navigationState,
      search: "",
      workoutType: "",
      muscle: "",
      exercise: "",
      plan: "",
      statuses: defaultFilters.statuses,
      progressOnly: false,
      sort: "newest",
      selected: null,
    });
  }

  function selectMode(nextMode: WorkoutHistoryPeriodMode) {
    setMode(nextMode);
    if (nextMode !== "custom") setCustomRange(null);
    const nextRange = workoutHistoryPeriodRange(nextMode === "custom" ? "month" : nextMode, new Date(), timezone);
    setAnchor(new Date());
    writeNavigation({ ...navigationState, period: nextMode, range: nextRange, selected: null });
  }

  function applyCustomRange() {
    try {
      const nextRange = customWorkoutHistoryPeriodRange(customFrom, customTo, timezone);
      setCustomRange(nextRange);
      writeNavigation({ ...navigationState, period: "custom", range: nextRange, selected: null });
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
        onPrevious={() => setAnchor((current) => {
          const nextAnchor = shiftWorkoutHistoryPeriodAnchor(current, mode === "custom" ? "month" : mode, -1);
          const nextRange = workoutHistoryPeriodRange(mode === "custom" ? "month" : mode, nextAnchor, timezone);
          writeNavigation({ ...navigationState, range: nextRange, selected: null });
          return nextAnchor;
        })}
        onNext={() => setAnchor((current) => {
          const nextAnchor = shiftWorkoutHistoryPeriodAnchor(current, mode === "custom" ? "month" : mode, 1);
          const nextRange = workoutHistoryPeriodRange(mode === "custom" ? "month" : mode, nextAnchor, timezone);
          writeNavigation({ ...navigationState, range: nextRange, selected: null });
          return nextAnchor;
        })}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onApplyCustom={applyCustomRange}
      />

      {pageState === "ready" && response ? (
        <div className="lg:hidden">
          <WorkoutHistorySummary summary={response.summary} periodDays={periodDays} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <WorkoutHistorySearch value={searchInput} onChange={setSearchInput} />
        <WorkoutHistoryFilters
          open={filtersOpen}
          value={filters}
          resultCount={response?.summary.eligibleWorkoutCount ?? null}
          options={response?.filterOptions}
          onOpenChange={setFiltersOpen}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            writeNavigation({
              ...navigationState,
              workoutType: nextFilters.workoutType,
              muscle: nextFilters.muscle,
              exercise: nextFilters.exercise,
              plan: nextFilters.plan,
              statuses: nextFilters.statuses,
              progressOnly: nextFilters.progressOnly,
              sort: nextFilters.sort,
              selected: null,
            });
          }}
          onClear={clearFilters}
        />
      </div>

      <WorkoutHistoryStateView
        state={pageState}
        notice={visibleNotice}
        onRetry={() => void loadFirstPage()}
        onClearFilters={clearFilters}
      />

      {pageState === "ready" && response ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start lg:gap-6 xl:gap-8">
          <div className="space-y-4 md:max-w-[760px] lg:max-w-none">
            <WorkoutHistoryTimeline
              items={response.items}
              timezone={timezone}
              selectedId={selectedId}
              onSelect={selectDesktopItem}
            />
            {nextCursor || loadMoreError ? (
              <WorkoutHistoryLoadMore
                loading={loadingMore}
                error={loadMoreError}
                onLoadMore={() => void loadMore()}
              />
            ) : null}
          </div>
          <div className="hidden lg:block">
            <WorkoutHistoryDesktopPreview
              item={selectedItem ?? response.items[0] ?? null}
              summary={response.summary}
              range={range}
              periodDays={periodDays}
            />
          </div>
        </div>
      ) : null}
    </TrainPageContainer>
  );
}
