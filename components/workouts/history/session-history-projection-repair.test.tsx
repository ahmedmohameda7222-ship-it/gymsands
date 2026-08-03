// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const sessionA = "22222222-2222-4222-8222-222222222222";
const sessionB = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: "11111111-1111-4111-8111-111111111111" },
    session: { access_token: "detail-token-a" },
  } as {
    user: { id: string } | null;
    session: { access_token: string } | null;
  },
  detail: vi.fn(),
  repair: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => mocks.auth,
}));
vi.mock("@/services/workouts/history/client", () => ({
  getWorkoutHistoryDetail: mocks.detail,
  WorkoutHistoryClientError: class WorkoutHistoryClientError extends Error {
    status: number;
    constructor(_code: string, message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock("@/services/workouts/history/verified-records-client", () => ({
  refreshVerifiedRecordsAuthenticated: mocks.repair,
}));
vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    dir: "ltr",
    locale: "en-US",
    tr: (key: string) => key,
  }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: { asChild?: boolean; children?: ReactNode } & Record<string, unknown>) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));
vi.mock("@/components/workouts/train-ui", () => ({
  TrainPageContainer: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
}));

for (const moduleName of [
  "exercise-history-section",
  "session-history-actions",
  "session-correction-dialog",
  "session-history-insight",
  "session-history-muscle-summary",
  "session-history-notes",
  "session-history-summary",
  "session-history-timeline",
]) {
  vi.mock(`@/components/workouts/history/${moduleName}`, () => ({
    ExerciseHistorySection: () => <div />,
    SessionHistoryActions: () => <div />,
    SessionCorrectionDialog: () => <div />,
    SessionHistoryInsight: () => <div />,
    SessionHistoryMuscleSummary: () => <div />,
    SessionHistoryNotes: () => <div />,
    SessionHistorySummary: () => <div />,
    SessionHistoryTimeline: () => <div />,
  }));
}

import { SessionHistoryPage } from "@/components/workouts/history/session-history-page";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function detailResponse(
  id: string,
  title: string,
  notices: WorkoutHistorySessionDetailResponse["notices"] = [],
): WorkoutHistorySessionDetailResponse {
  return {
    contractVersion: 1,
    activity: {
      contractVersion: 1,
      activityId: `performed:${id}`,
      canonicalSessionId: id,
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
      capabilities: {
        openDetails: true,
        showPerformedSets: true,
        showPlannedVsActual: true,
        showMuscleAnalysis: false,
        calculatePerformanceMetrics: true,
        calculateVerifiedRecords: true,
        repeatWorkout: true,
        correctSession: false,
        softDeleteSession: true,
      },
    },
    summary: {
      exerciseCount: 0,
      completedSetCount: 0,
      reliableVolume: 0,
      verifiedRecordCount: 0,
    },
    snapshot: null,
    exercises: [],
    timeline: [],
    notices,
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

async function renderPage(id = sessionA) {
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(<SessionHistoryPage source="performed" id={id} />);
  });
  await flush();
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.auth = {
    user: { id: ownerId },
    session: { access_token: "detail-token-a" },
  };
  mocks.detail.mockReset();
  mocks.repair.mockReset();
});

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe("Session History automatic projection repair", () => {
  it("passes AuthProvider token and signal, ignores token-only refresh, and uses the latest token on later repair", async () => {
    mocks.detail
      .mockResolvedValueOnce(detailResponse(sessionA, "Needs repair", ["user-action-required"]))
      .mockResolvedValueOnce(detailResponse(sessionA, "Repaired"));
    mocks.repair.mockResolvedValue({ status: "current" });

    await renderPage();

    expect(mocks.repair).toHaveBeenCalledOnce();
    expect(mocks.repair.mock.calls[0]?.[0]).toBe(sessionA);
    expect(mocks.repair.mock.calls[0]?.[1]).toMatchObject({
      accessToken: "detail-token-a",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.detail).toHaveBeenCalledTimes(2);

    mocks.auth = {
      ...mocks.auth,
      session: { access_token: "detail-token-b" },
    };
    await renderPage();
    expect(mocks.detail).toHaveBeenCalledTimes(2);
    expect(mocks.repair).toHaveBeenCalledOnce();

    mocks.detail
      .mockResolvedValueOnce(detailResponse(sessionA, "Needs repair again", ["user-action-required"]))
      .mockResolvedValueOnce(detailResponse(sessionA, "Repaired again"));
    await act(async () => window.dispatchEvent(new Event("online")));
    await flush();

    expect(mocks.repair).toHaveBeenCalledTimes(2);
    expect(mocks.repair.mock.calls[1]?.[1]).toMatchObject({
      accessToken: "detail-token-b",
    });
  });

  it("prevents aborted stale repair from triggering a second detail read or stale publication", async () => {
    const pendingRepair = deferred<{ status: "current" }>();
    mocks.detail
      .mockResolvedValueOnce(detailResponse(sessionA, "Stale detail", ["user-action-required"]))
      .mockResolvedValueOnce(detailResponse(sessionB, "Current detail"));
    mocks.repair.mockReturnValueOnce(pendingRepair.promise);

    await renderPage(sessionA);
    expect(mocks.repair).toHaveBeenCalledOnce();
    const staleSignal = mocks.repair.mock.calls[0]?.[1]?.signal as AbortSignal;

    await renderPage(sessionB);
    expect(staleSignal.aborted).toBe(true);
    expect(mocks.detail).toHaveBeenCalledTimes(2);

    pendingRepair.resolve({ status: "current" });
    await flush();

    expect(mocks.detail).toHaveBeenCalledTimes(2);
    expect(container?.textContent).toContain("Current detail");
    expect(container?.textContent).not.toContain("Stale detail");
  });
});
