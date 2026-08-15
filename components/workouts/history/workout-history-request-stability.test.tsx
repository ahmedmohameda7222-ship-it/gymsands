// @vitest-environment jsdom

import {
  act,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";

type FilterValue = {
  workoutType: string;
  muscle: string;
  exercise: string;
  plan: string;
  statuses: Array<
    "completed" | "partial" | "cancelled" | "skipped"
  >;
  progressOnly: boolean;
  sort: "newest" | "oldest" | "longest_duration";
};

const mocks = vi.hoisted(() => ({
  url: "from=2026-08-01&to=2026-08-31",
  auth: {
    user: { id: "11111111-1111-4111-8111-111111111111" },
    session: { access_token: "token-a" },
  } as {
    user: { id: string } | null;
    session: { access_token: string } | null;
  },
  push: vi.fn(),
  replace: vi.fn(),
  list: vi.fn(),
  loadMore: null as (() => void) | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/workout-history",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.url),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    dir: "ltr",
    locale: "en-US",
    tr: (key: string) => key,
  }),
}));

vi.mock("@/services/workouts/history/client", () => ({
  getWorkoutHistoryList: mocks.list,
}));

vi.mock(
  "@/components/workouts/history/workout-history-header",
  () => ({
    WorkoutHistoryHeader: () => (
      <header data-workout-history-header />
    ),
  }),
);

vi.mock(
  "@/components/workouts/history/workout-history-period-control",
  () => ({
    WorkoutHistoryPeriodControl: ({
      onPrevious,
      onNext,
      onApplyCustom,
    }: {
      onPrevious: () => void;
      onNext: () => void;
      onApplyCustom: () => void;
    }) => (
      <div>
        <button data-previous onClick={onPrevious} />
        <button data-next onClick={onNext} />
        <button data-apply-custom onClick={onApplyCustom} />
      </div>
    ),
  }),
);

vi.mock(
  "@/components/workouts/history/workout-history-search",
  () => ({
    WorkoutHistorySearch: ({
      value,
      onChange,
    }: {
      value: string;
      onChange: (value: string) => void;
    }) => (
      <input
        data-search
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
      />
    ),
  }),
);

vi.mock(
  "@/components/workouts/history/workout-history-filters",
  () => ({
    WorkoutHistoryFilters: ({
      open,
      value,
      onOpenChange,
      onChange,
    }: {
      open: boolean;
      value: FilterValue;
      onOpenChange: (open: boolean) => void;
      onChange: (value: FilterValue) => void;
    }) => (
      <div>
        <button
          data-filter-panel
          onClick={() => onOpenChange(!open)}
        />
        <button
          data-filter-commit
          onClick={() =>
            onChange({
              ...value,
              workoutType:
                value.workoutType === "strength"
                  ? "conditioning"
                  : "strength",
            })
          }
        />
      </div>
    ),
  }),
);

vi.mock(
  "@/components/workouts/history/workout-history-state-view",
  () => ({
    WorkoutHistoryStateView: ({
      state,
      onRetry,
    }: {
      state: string;
      onRetry: () => void;
    }) => (
      <div data-page-state={state}>
        <button data-retry onClick={onRetry} />
      </div>
    ),
  }),
);

vi.mock(
  "@/components/workouts/history/workout-history-summary",
  () => ({
    WorkoutHistorySummary: () => <div data-summary />,
  }),
);

vi.mock(
  "@/components/workouts/history/workout-history-timeline",
  () => ({
    WorkoutHistoryTimeline: ({
      items,
      onSelect,
    }: {
      items: Array<{ activityId: string; title: string }>;
      onSelect: (item: {
        activityId: string;
        title: string;
      }) => void;
    }) => (
      <div>
        {items.map((item) => (
          <button
            key={item.activityId}
            data-select-item={item.activityId}
            data-item-title={item.title}
            onClick={() => onSelect(item)}
          />
        ))}
      </div>
    ),
  }),
);

vi.mock(
  "@/components/workouts/history/workout-history-load-more",
  () => ({
    WorkoutHistoryLoadMore: ({
      onLoadMore,
    }: {
      onLoadMore: () => void;
    }) => {
      mocks.loadMore = onLoadMore;
      return <button data-load-more onClick={onLoadMore} />;
    },
  }),
);

vi.mock("@/components/workouts/train-ui", () => ({
  TrainPageContainer: ({
    children,
  }: {
    children: ReactNode;
  }) => <main data-workout-history-page>{children}</main>,
}));

import { WorkoutHistoryPage } from "@/components/workouts/history/workout-history-page";
import { WorkoutHistoryFirstPageRequestCoordinator } from "@/lib/workouts/history/first-page-request-coordinator";
import type { WorkoutHistoryListResponse } from "@/types/workout-history";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function historyResponse(
  ownerId: string,
  title: string,
  nextCursor: string | null = null,
  activityIdOverride?: string,
): WorkoutHistoryListResponse {
  const activityId =
    activityIdOverride ??
    (ownerId === ownerA
      ? "30000000-0000-4000-8000-000000000001"
      : "40000000-0000-4000-8000-000000000001");
  return {
    contractVersion: 1,
    period: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
    },
    summary: {
      eligibleWorkoutCount: 1,
      trustedDurationMinutes: 60,
      completedSetCount: 4,
      reliableVolume: 1_000,
      verifiedRecordCount: 0,
    },
    items: [
      {
        contractVersion: 1,
        activityId: `performed:${activityId}`,
        canonicalSessionId: activityId,
        scheduledSessionId: null,
        userId: ownerId,
        sourceKind: "performed",
        lifecycle: "completed",
        title,
        category: "strength",
        effectiveAt: "2026-08-02T10:00:00.000Z",
        startedAt: "2026-08-02T10:00:00.000Z",
        completedAt: "2026-08-02T11:00:00.000Z",
        skippedAt: null,
        cancelledAt: null,
        durationMinutes: 60,
        notes: null,
        planId: null,
        planDayId: null,
        planWeekId: null,
        planSessionId: null,
        hasPerformedSets: true,
        hasMeaningfulPerformance: true,
        exerciseCount: 1,
        completedSetCount: 4,
        reliableVolume: 1_000,
        verifiedRecordCount: 0,
        exerciseNames: ["Bench press"],
        exerciseIds: [
          "global:50000000-0000-4000-8000-000000000001",
        ],
        muscleIds: ["pectoralis_major_sternal"],
        insight: null,
        capabilities: {
          openDetails: true,
          showPerformedSets: true,
          showPlannedVsActual: true,
          showMuscleAnalysis: true,
          calculatePerformanceMetrics: true,
          calculateVerifiedRecords: true,
          repeatWorkout: true,
          correctSession: true,
          softDeleteSession: true,
        },
      },
    ],
    nextCursor,
    notices: [],
    filterOptions: {
      workoutTypes: [],
      muscles: [],
      exercises: [],
      plans: [],
    },
  };
}

function emptyHistoryResponse(ownerId = ownerA): WorkoutHistoryListResponse {
  const response = historyResponse(ownerId, "unused");
  return {
    ...response,
    summary: {
      ...response.summary!,
      eligibleWorkoutCount: 0,
    },
    items: [],
    hasAnyHistory: false,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPage() {
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(<WorkoutHistoryPage />);
  });
  await flush();
}

function click(selector: string) {
  const element = container?.querySelector<HTMLButtonElement>(
    selector,
  );
  if (!element) throw new Error(`Missing ${selector}`);
  element.click();
}

async function changeSearch(value: string) {
  const input =
    container?.querySelector<HTMLInputElement>("[data-search]");
  if (!input) throw new Error("Missing search input");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(
      new Event("input", {
        bubbles: true,
      }),
    );
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.url = "from=2026-08-01&to=2026-08-31";
  mocks.auth = {
    user: { id: ownerA },
    session: { access_token: "token-a" },
  };
  mocks.loadMore = null;
  mocks.push.mockReset().mockImplementation((href: string) => {
    mocks.url = href.split("?")[1] ?? "";
  });
  mocks.replace.mockReset().mockImplementation((href: string) => {
    mocks.url = href.split("?")[1] ?? "";
  });
  mocks.list
    .mockReset()
    .mockResolvedValue(historyResponse(ownerA, "Owner A"));
});

afterEach(async () => {
  vi.useRealTimers();
  if (root) {
    await act(async () => root!.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe("Workout History request stability", () => {
  it("loads the initial canonical query exactly once with the AuthProvider token", async () => {
    await renderPage();

    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.list.mock.calls[0]?.[0]).toBe(ownerA);
    expect(mocks.list.mock.calls[0]?.[2]).toMatchObject({
      accessToken: "token-a",
    });
  });

  it("ignores legacy selected navigation and equivalent parameter ordering", async () => {
    await renderPage();
    mocks.url = `${mocks.url}&selected=performed%3Alegacy`;
    await renderPage();

    expect(mocks.list).toHaveBeenCalledOnce();

    mocks.url = mocks.url
      .split("&")
      .reverse()
      .join("&");
    await renderPage();
    expect(mocks.list).toHaveBeenCalledOnce();

    mocks.url = mocks.url
      .split("&")
      .filter((part) => !part.startsWith("selected="))
      .join("&");
    await renderPage();
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it("treats a successful empty response as resolved across rerender and ignored legacy navigation", async () => {
    mocks.list.mockResolvedValue(emptyHistoryResponse());
    await renderPage();
    expect(mocks.list).toHaveBeenCalledOnce();

    await renderPage();
    mocks.url = `${mocks.url}&selected=performed%3Aempty`;
    await renderPage();

    expect(mocks.list).toHaveBeenCalledOnce();
    expect(container?.querySelector("[data-page-state=empty]")).not.toBeNull();
  });

  it("does not refetch when the filter panel opens or closes", async () => {
    await renderPage();

    await act(async () => click("[data-filter-panel]"));
    await act(async () => click("[data-filter-panel]"));

    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it("starts exactly one new first-page request for one filter commit", async () => {
    await renderPage();

    await act(async () => click("[data-filter-commit]"));
    await renderPage();

    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.list.mock.calls[1]?.[1]).toMatchObject({
      workoutTypes: ["strength"],
    });
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("debounces normalized search into one committed request and ignores the same normalized value", async () => {
    vi.useFakeTimers();
    await renderPage();

    await changeSearch("  bench   press  ");
    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(mocks.list).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await renderPage();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.list.mock.calls[1]?.[1]).toMatchObject({
      search: "bench press",
    });
    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();

    await changeSearch("bench    press");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await renderPage();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenCalledOnce();
  });

  it("does not refetch for a token refresh and uses the latest token on the next genuine query", async () => {
    await renderPage();

    mocks.auth = {
      user: { id: ownerA },
      session: { access_token: "token-a-refreshed" },
    };
    await renderPage();
    expect(mocks.list).toHaveBeenCalledOnce();

    await act(async () => click("[data-filter-commit]"));
    await renderPage();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.list.mock.calls[1]?.[2]).toMatchObject({
      accessToken: "token-a-refreshed",
    });
  });

  it("creates exactly one new request after a failed first-page request and Retry", async () => {
    mocks.list
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(historyResponse(ownerA, "Recovered"));
    await renderPage();
    expect(mocks.list).toHaveBeenCalledOnce();

    await act(async () => click("[data-retry]"));
    await flush();

    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(container?.querySelector('[data-item-title="Recovered"]')).not.toBeNull();
  });

  it("keeps repeatedly rejected Retry usable without an unhandled rejection", async () => {
    mocks.list
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValueOnce(historyResponse(ownerA, "Third attempt"));
    await renderPage();

    await act(async () => click("[data-retry]"));
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(2);

    await act(async () => click("[data-retry]"));
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(3);
    expect(container?.querySelector('[data-item-title="Third attempt"]')).not.toBeNull();
  });

  it("keeps one cursor request independent from the first page during a double click", async () => {
    const cursor = deferred<WorkoutHistoryListResponse>();
    mocks.list
      .mockResolvedValueOnce(
        historyResponse(ownerA, "First page", "cursor-1"),
      )
      .mockReturnValueOnce(cursor.promise);
    await renderPage();

    await act(async () => {
      click("[data-load-more]");
      click("[data-load-more]");
    });

    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(
      mocks.list.mock.calls.filter(
        (call) => call[1]?.cursor === undefined,
      ),
    ).toHaveLength(1);
    expect(mocks.list.mock.calls[1]?.[1]).toMatchObject({
      cursor: "cursor-1",
    });

    cursor.resolve(historyResponse(ownerA, "Second page", null, "30000000-0000-4000-8000-000000000002"));
    await flush();
  });

  it("does not submit a successfully completed cursor again, including a repeated server cursor", async () => {
    mocks.list
      .mockResolvedValueOnce(historyResponse(ownerA, "First page", "cursor-1"))
      .mockResolvedValueOnce(historyResponse(ownerA, "Second page", "cursor-1", "30000000-0000-4000-8000-000000000002"));
    await renderPage();

    await act(async () => mocks.loadMore?.());
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(2);

    await act(async () => mocks.loadMore?.());
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed cursor retryable without restarting the first page", async () => {
    mocks.list
      .mockResolvedValueOnce(historyResponse(ownerA, "First page", "cursor-1"))
      .mockRejectedValueOnce(new Error("cursor failed"))
      .mockResolvedValueOnce(historyResponse(ownerA, "Second page", null, "30000000-0000-4000-8000-000000000002"));
    await renderPage();

    await act(async () => mocks.loadMore?.());
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(2);

    await act(async () => mocks.loadMore?.());
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(3);
    expect(
      mocks.list.mock.calls.filter((call) => call[1]?.cursor === undefined),
    ).toHaveLength(1);
  });

  it("prevents an old pending cursor from publishing after a query change", async () => {
    const pendingCursor = deferred<WorkoutHistoryListResponse>();
    mocks.list
      .mockResolvedValueOnce(historyResponse(ownerA, "First page", "cursor-1"))
      .mockReturnValueOnce(pendingCursor.promise)
      .mockResolvedValueOnce(historyResponse(ownerA, "Filtered page"));
    await renderPage();

    await act(async () => mocks.loadMore?.());
    await act(async () => click("[data-filter-commit]"));
    await renderPage();
    expect(mocks.list).toHaveBeenCalledTimes(3);

    pendingCursor.resolve(historyResponse(ownerA, "Stale cursor", null, "30000000-0000-4000-8000-000000000009"));
    await flush();

    expect(container?.querySelector('[data-item-title="Filtered page"]')).not.toBeNull();
    expect(container?.querySelector('[data-item-title="Stale cursor"]')).toBeNull();
  });

  it("clears completed cursor authority when the user changes", async () => {
    mocks.list
      .mockResolvedValueOnce(historyResponse(ownerA, "A first", "cursor-1"))
      .mockResolvedValueOnce(historyResponse(ownerA, "A second", null, "30000000-0000-4000-8000-000000000002"))
      .mockResolvedValueOnce(historyResponse(ownerB, "B first"))
      .mockResolvedValueOnce(historyResponse(ownerA, "A first again", "cursor-1"))
      .mockResolvedValueOnce(historyResponse(ownerA, "A second again", null, "30000000-0000-4000-8000-000000000003"));
    await renderPage();
    await act(async () => mocks.loadMore?.());
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(2);

    mocks.auth = {
      user: { id: ownerB },
      session: { access_token: "token-b" },
    };
    await renderPage();

    mocks.auth = {
      user: { id: ownerA },
      session: { access_token: "token-a-new" },
    };
    await renderPage();
    await act(async () => mocks.loadMore?.());
    await flush();

    expect(mocks.list).toHaveBeenCalledTimes(5);
    expect(mocks.list.mock.calls[4]?.[1]).toMatchObject({ cursor: "cursor-1" });
  });

  it("blocks old-user publication and starts one request with the new user's latest token", async () => {
    const pendingA = deferred<WorkoutHistoryListResponse>();
    const pendingB = deferred<WorkoutHistoryListResponse>();
    mocks.list.mockImplementation(
      (userId: string) =>
        userId === ownerA ? pendingA.promise : pendingB.promise,
    );

    await renderPage();
    expect(mocks.list).toHaveBeenCalledOnce();

    mocks.auth = {
      user: { id: ownerB },
      session: { access_token: "token-b" },
    };
    await renderPage();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.list.mock.calls[1]?.[0]).toBe(ownerB);
    expect(mocks.list.mock.calls[1]?.[2]).toMatchObject({
      accessToken: "token-b",
    });

    pendingA.resolve(historyResponse(ownerA, "Stale owner A"));
    await flush();
    expect(
      container?.querySelector('[data-item-title="Stale owner A"]'),
    ).toBeNull();

    pendingB.resolve(historyResponse(ownerB, "Current owner B"));
    await flush();
    expect(
      container?.querySelector('[data-item-title="Current owner B"]'),
    ).not.toBeNull();
  });

  it("freezes the implicit default range for the mounted page across a month boundary", async () => {
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    const timezone = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockImplementation(function resolvedOptionsInBerlin(this: Intl.DateTimeFormat) {
        return { ...resolvedOptions.call(this), timeZone: "Europe/Berlin" };
      });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-31T23:59:00.000Z"));
      mocks.url = "";
      await renderPage();

      expect(mocks.list).toHaveBeenCalledOnce();
      expect(mocks.list.mock.calls[0]?.[1]).toMatchObject({
        from: "2026-08-31T22:00:00.000Z",
        to: "2026-09-30T22:00:00.000Z",
      });

      vi.setSystemTime(new Date("2026-09-01T00:01:00.000Z"));
      mocks.url = "selected=performed%3Amonth-boundary";
      await renderPage();
      mocks.url = "";
      await renderPage();

      expect(mocks.list).toHaveBeenCalledOnce();
    } finally {
      timezone.mockRestore();
    }
  });
});

describe("WorkoutHistoryFirstPageRequestCoordinator", () => {
  it("reuses one in-flight operation for concurrent same-key triggers and retry", async () => {
    const coordinator =
      new WorkoutHistoryFirstPageRequestCoordinator<string>();
    const pending = deferred<string>();
    const loader = vi.fn(() => pending.promise);

    const first = coordinator.load("owner:key", loader);
    const second = coordinator.load("owner:key", loader);
    const retry = coordinator.load("owner:key", loader, {
      force: true,
    });

    expect(loader).toHaveBeenCalledOnce();
    expect(second).toBe(first);
    expect(retry).toBe(first);

    pending.resolve("ready");
    await expect(first).resolves.toMatchObject({
      value: "ready",
    });
  });

  it("rejects stale publication after a different query starts", async () => {
    const coordinator =
      new WorkoutHistoryFirstPageRequestCoordinator<string>();
    const pendingA = deferred<string>();
    const pendingB = deferred<string>();

    const resultA = coordinator.load("owner:a", () => pendingA.promise);
    const resultB = coordinator.load("owner:b", () => pendingB.promise);

    pendingA.resolve("a");
    const stale = await resultA;
    expect(coordinator.accepts(stale)).toBe(false);

    pendingB.resolve("b");
    const current = await resultB;
    expect(coordinator.accepts(current)).toBe(true);
  });

  it("starts one forced retry after failure without unhandled rejection", async () => {
    const coordinator =
      new WorkoutHistoryFirstPageRequestCoordinator<string>();
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce("recovered");

    await expect(
      coordinator.load("owner:key", loader),
    ).rejects.toThrow("failed");
    await expect(
      coordinator.load("owner:key", loader, { force: true }),
    ).resolves.toMatchObject({ value: "recovered" });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
