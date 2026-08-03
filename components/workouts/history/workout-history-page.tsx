"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { WorkoutHistoryDesktopPreview } from "@/components/workouts/history/workout-history-desktop-preview";
import {
  WorkoutHistoryFilters,
  type WorkoutHistoryFilterValue,
} from "@/components/workouts/history/workout-history-filters";
import { WorkoutHistoryHeader } from "@/components/workouts/history/workout-history-header";
import { WorkoutHistoryLoadMore } from "@/components/workouts/history/workout-history-load-more";
import { WorkoutHistoryPeriodControl } from "@/components/workouts/history/workout-history-period-control";
import { WorkoutHistorySearch } from "@/components/workouts/history/workout-history-search";
import {
  WorkoutHistoryStateView,
  type WorkoutHistoryPageState,
} from "@/components/workouts/history/workout-history-state-view";
import { WorkoutHistorySummary } from "@/components/workouts/history/workout-history-summary";
import { WorkoutHistoryTimeline } from "@/components/workouts/history/workout-history-timeline";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";
import {
  customWorkoutHistoryPeriodRange,
  shiftWorkoutHistoryPeriodAnchor,
  workoutHistoryPeriodRange,
  workoutHistoryTimeZoneParts,
} from "@/lib/workouts/history/date-range";
import { WorkoutHistoryFirstPageRequestCoordinator } from "@/lib/workouts/history/first-page-request-coordinator";
import {
  parseWorkoutHistoryNavigationState,
  workoutHistoryNavigationSearchParams,
  type WorkoutHistoryNavigationState,
} from "@/lib/workouts/history/navigation-state";
import {
  workoutHistoryCursorRequestKey,
  workoutHistoryFirstPageRequestKey,
} from "@/lib/workouts/history/request-key";
import { getWorkoutHistoryList } from "@/services/workouts/history/client";
import type {
  WorkoutHistoryListRequest,
  WorkoutHistoryListResponse,
} from "@/types/workout-history";

const defaultFilters: WorkoutHistoryFilterValue = {
  statuses: ["completed", "partial"],
  progressOnly: false,
  workoutType: "",
  muscle: "",
  exercise: "",
  plan: "",
  sort: "newest",
};

type FirstPageAuthority = {
  key: string | null;
  response: WorkoutHistoryListResponse | null;
  initialLoading: boolean;
  blockingError: boolean;
};

type CursorRequest = {
  key: string;
  controller: AbortController;
  promise: Promise<void>;
};

function inputDate(value: Date, timezone: string): string {
  const parts = workoutHistoryTimeZoneParts(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function listRequestFromNavigation(
  navigation: WorkoutHistoryNavigationState,
): WorkoutHistoryListRequest {
  return {
    ...navigation.range,
    limit: 20,
    search: navigation.search || undefined,
    workoutTypes: navigation.workoutType
      ? [navigation.workoutType]
      : undefined,
    muscleIds: navigation.muscle ? [navigation.muscle] : undefined,
    exerciseIds: navigation.exercise ? [navigation.exercise] : undefined,
    planIds: navigation.plan ? [navigation.plan] : undefined,
    statuses: navigation.statuses,
    progressOnly: navigation.progressOnly || undefined,
    sort: navigation.sort,
  };
}

function filtersFromNavigation(
  navigation: WorkoutHistoryNavigationState,
): WorkoutHistoryFilterValue {
  return {
    statuses: navigation.statuses,
    progressOnly: navigation.progressOnly,
    workoutType: navigation.workoutType,
    muscle: navigation.muscle,
    exercise: navigation.exercise,
    plan: navigation.plan,
    sort: navigation.sort,
  };
}

export function WorkoutHistoryPage() {
  const { user, session } = useAuth();
  const userId = user?.id;
  const { dir } = useTrainTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const urlString = searchParams.toString();

  const navigationState = useMemo(
    () =>
      parseWorkoutHistoryNavigationState(
        new URLSearchParams(urlString),
        new Date(),
        timezone,
      ),
    [timezone, urlString],
  );
  const navigationRef = useRef(navigationState);

  const range = navigationState.range;
  const mode = navigationState.period;
  const filters = useMemo(
    () => filtersFromNavigation(navigationState),
    [navigationState],
  );
  const request = useMemo(
    () => listRequestFromNavigation(navigationState),
    [navigationState],
  );
  const requestRef = useRef(request);

  const accessTokenRef = useRef<string | null>(
    session?.access_token ?? null,
  );

  const firstPageKey = useMemo(
    () =>
      userId
        ? workoutHistoryFirstPageRequestKey(userId, request)
        : null,
    [request, userId],
  );
  const firstPageKeyRef = useRef(firstPageKey);

  const [searchInput, setSearchInput] = useState(navigationState.search);
  const [customFrom, setCustomFrom] = useState(() =>
    inputDate(new Date(range.from), timezone),
  );
  const [customTo, setCustomTo] = useState(() =>
    inputDate(new Date(Date.parse(range.to) - 1), timezone),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [firstPage, setFirstPage] = useState<FirstPageAuthority>({
    key: null,
    response: null,
    initialLoading: true,
    blockingError: false,
  });
  const firstPageRef = useRef(firstPage);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const cursorRequestRef = useRef<CursorRequest | null>(null);
  const [firstPageCoordinator] = useState(
    () =>
      new WorkoutHistoryFirstPageRequestCoordinator<WorkoutHistoryListResponse>(),
  );

  useEffect(() => {
    navigationRef.current = navigationState;
    requestRef.current = request;
    accessTokenRef.current = session?.access_token ?? null;
    firstPageKeyRef.current = firstPageKey;
    firstPageRef.current = firstPage;
  }, [
    firstPage,
    firstPageKey,
    navigationState,
    request,
    session?.access_token,
  ]);

  const writeNavigation = useCallback(
    (next: WorkoutHistoryNavigationState) => {
      const nextParams = workoutHistoryNavigationSearchParams(next);
      const nextString = nextParams.toString();
      const currentString = workoutHistoryNavigationSearchParams(
        navigationRef.current,
      ).toString();
      if (nextString === currentString) return;
      router.push(
        nextString ? `${pathname}?${nextString}` : pathname,
        { scroll: false },
      );
    },
    [pathname, router],
  );

  useEffect(() => {
    setSearchInput(navigationState.search);
  }, [navigationState.search]);

  useEffect(() => {
    setCustomFrom(inputDate(new Date(range.from), timezone));
    setCustomTo(
      inputDate(new Date(Date.parse(range.to) - 1), timezone),
    );
  }, [range.from, range.to, timezone]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim();
      if (normalized === navigationState.search) return;
      writeNavigation({
        ...navigationRef.current,
        search: normalized,
        selected: null,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [navigationState.search, searchInput, writeNavigation]);

  const cancelCursorRequest = useCallback(() => {
    cursorRequestRef.current?.controller.abort();
    cursorRequestRef.current = null;
    setLoadingMore(false);
    setLoadMoreError(false);
  }, []);

  const loadFirstPage = useCallback(
    async (force = false) => {
      const key = firstPageKey;
      const ownerId = userId;
      if (!key || !ownerId) return;

      cancelCursorRequest();
      const existing =
        firstPageRef.current.key === key
          ? firstPageRef.current.response
          : null;
      const hasUsableResponse = Boolean(existing?.items.length);
      setFirstPage({
        key,
        response: existing,
        initialLoading: !hasUsableResponse,
        blockingError: false,
      });

      try {
        const coordinated = await firstPageCoordinator.load(
          key,
          (signal) =>
            getWorkoutHistoryList(ownerId, requestRef.current, {
              accessToken: accessTokenRef.current,
              signal,
            }),
          { force },
        );
        if (
          firstPageKeyRef.current !== key ||
          !firstPageCoordinator.accepts(coordinated)
        ) {
          return;
        }
        setFirstPage({
          key,
          response: coordinated.value,
          initialLoading: false,
          blockingError: false,
        });
      } catch {
        if (
          firstPageKeyRef.current !== key ||
          !firstPageCoordinator.isCurrentKey(key)
        ) {
          return;
        }
        setFirstPage((current) => {
          const response = current.key === key ? current.response : null;
          return {
            key,
            response,
            initialLoading: false,
            blockingError: !response?.items.length,
          };
        });
      }
    },
    [
      cancelCursorRequest,
      firstPageCoordinator,
      firstPageKey,
      userId,
    ],
  );

  useEffect(() => {
    cancelCursorRequest();
    if (!firstPageKey || !userId) {
      firstPageCoordinator.invalidate();
      setFirstPage({
        key: null,
        response: null,
        initialLoading: false,
        blockingError: false,
      });
      return;
    }
    void loadFirstPage();
  }, [
    cancelCursorRequest,
    firstPageCoordinator,
    firstPageKey,
    loadFirstPage,
    userId,
  ]);

  useEffect(
    () => () => {
      firstPageCoordinator.dispose();
      cursorRequestRef.current?.controller.abort();
      cursorRequestRef.current = null;
    },
    [firstPageCoordinator],
  );

  const loadMore = useCallback(async () => {
    const key = firstPageKeyRef.current;
    const authority = firstPageRef.current;
    const ownerId = userId;
    const nextCursor =
      authority.key === key ? authority.response?.nextCursor : null;
    if (!key || !ownerId || !nextCursor) return;

    const cursorRequest: WorkoutHistoryListRequest = {
      ...requestRef.current,
      cursor: nextCursor,
    };
    const cursorKey = workoutHistoryCursorRequestKey(
      ownerId,
      cursorRequest,
    );
    if (cursorRequestRef.current?.key === cursorKey) {
      await cursorRequestRef.current.promise;
      return;
    }

    cursorRequestRef.current?.controller.abort();
    const controller = new AbortController();
    setLoadingMore(true);
    setLoadMoreError(false);

    const promise = (async () => {
      try {
        const next = await getWorkoutHistoryList(
          ownerId,
          cursorRequest,
          {
            accessToken: accessTokenRef.current,
            signal: controller.signal,
          },
        );
        if (
          controller.signal.aborted ||
          firstPageKeyRef.current !== key
        ) {
          return;
        }
        setFirstPage((current) =>
          current.key === key && current.response
            ? {
                ...current,
                response: {
                  ...next,
                  summary: current.response.summary,
                  filterOptions: current.response.filterOptions,
                  items: [
                    ...current.response.items,
                    ...next.items.filter(
                      (candidate) =>
                        !current.response!.items.some(
                          (item) =>
                            item.activityId === candidate.activityId,
                        ),
                    ),
                  ],
                },
              }
            : current,
        );
      } catch {
        if (
          !controller.signal.aborted &&
          firstPageKeyRef.current === key
        ) {
          setLoadMoreError(true);
        }
      } finally {
        if (cursorRequestRef.current?.key === cursorKey) {
          cursorRequestRef.current = null;
          setLoadingMore(false);
        }
      }
    })();

    cursorRequestRef.current = {
      key: cursorKey,
      controller,
      promise,
    };
    await promise;
  }, [userId]);

  const visibleFirstPage =
    firstPage.key === firstPageKey
      ? firstPage
      : {
          key: firstPageKey,
          response: null,
          initialLoading: Boolean(firstPageKey),
          blockingError: false,
        };
  const response = visibleFirstPage.response;
  const nextCursor = response?.nextCursor ?? null;

  const hasFilters =
    navigationState.search.length > 0 ||
    filters.progressOnly ||
    filters.workoutType.length > 0 ||
    filters.muscle.length > 0 ||
    filters.exercise.length > 0 ||
    filters.plan.length > 0 ||
    filters.sort !== defaultFilters.sort ||
    filters.statuses.length !== defaultFilters.statuses.length ||
    filters.statuses.some(
      (status) => !defaultFilters.statuses.includes(status),
    );

  let pageState: WorkoutHistoryPageState = "ready";
  if (visibleFirstPage.initialLoading && !response) {
    pageState = "initial-loading";
  } else if (visibleFirstPage.blockingError && !response?.items.length) {
    pageState = "blocking-error";
  } else if (!response?.items.length) {
    pageState = hasFilters ? "filtered-empty" : "empty";
  }

  const visibleNotice = response?.notices.includes("stale-data")
    ? "stale-data"
    : response?.notices.includes("partial-availability")
      ? "partial-availability"
      : null;
  const selectedId = navigationState.selected;
  const selectedItem =
    response?.items.find((item) => item.activityId === selectedId) ??
    null;
  const periodDays = Math.max(
    1,
    (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000,
  );

  const selectDesktopItem = useCallback(
    (item: WorkoutHistoryListResponse["items"][number]) => {
      writeNavigation({
        ...navigationRef.current,
        selected: item.activityId,
      });
    },
    [writeNavigation],
  );

  function clearFilters() {
    setSearchInput("");
    setFiltersOpen(false);
    writeNavigation({
      ...navigationRef.current,
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

  function selectMode(
    nextMode: WorkoutHistoryNavigationState["period"],
  ) {
    const nextRange = workoutHistoryPeriodRange(
      nextMode === "custom" ? "month" : nextMode,
      new Date(),
      timezone,
    );
    writeNavigation({
      ...navigationRef.current,
      period: nextMode,
      range: nextRange,
      selected: null,
    });
  }

  function shiftPeriod(direction: -1 | 1) {
    const effectiveMode = mode === "custom" ? "month" : mode;
    const nextAnchor = shiftWorkoutHistoryPeriodAnchor(
      new Date(range.from),
      effectiveMode,
      direction,
    );
    const nextRange = workoutHistoryPeriodRange(
      effectiveMode,
      nextAnchor,
      timezone,
    );
    writeNavigation({
      ...navigationRef.current,
      range: nextRange,
      selected: null,
    });
  }

  function applyCustomRange() {
    try {
      const nextRange = customWorkoutHistoryPeriodRange(
        customFrom,
        customTo,
        timezone,
      );
      writeNavigation({
        ...navigationRef.current,
        period: "custom",
        range: nextRange,
        selected: null,
      });
    } catch {
      // Draft values remain available for correction.
    }
  }

  return (
    <TrainPageContainer
      className="space-y-4 pb-8"
      dir={dir}
      withGutters
      data-workout-history-page
    >
      <WorkoutHistoryHeader />
      <WorkoutHistoryPeriodControl
        mode={mode}
        range={range}
        customFrom={customFrom}
        customTo={customTo}
        onModeChange={selectMode}
        onPrevious={() => shiftPeriod(-1)}
        onNext={() => shiftPeriod(1)}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onApplyCustom={applyCustomRange}
      />

      {pageState === "ready" && response ? (
        <div className="lg:hidden">
          <WorkoutHistorySummary
            summary={response.summary}
            periodDays={periodDays}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <WorkoutHistorySearch
          value={searchInput}
          onChange={setSearchInput}
        />
        <WorkoutHistoryFilters
          open={filtersOpen}
          value={filters}
          resultCount={
            response?.summary.eligibleWorkoutCount ?? null
          }
          options={response?.filterOptions}
          onOpenChange={setFiltersOpen}
          onChange={(nextFilters) => {
            writeNavigation({
              ...navigationRef.current,
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
        onRetry={() => void loadFirstPage(true)}
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
