import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    useMockAuth: false,
    productionQaBuild: false,
  },
  resolveCompatibilityToken: vi.fn(),
  readCache: vi.fn(),
  writeCache: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock(
  "@/services/workouts/history/session-compat",
  () => ({
    resolveWorkoutHistoryCompatibilityAccessToken:
      mocks.resolveCompatibilityToken,
  }),
);
vi.mock("@/lib/workouts/history/offline-cache", () => ({
  readWorkoutHistoryCache: mocks.readCache,
  writeWorkoutHistoryCache: mocks.writeCache,
}));

import {
  getCanonicalWorkoutActivity,
  getWorkoutHistoryDetail,
  getWorkoutHistoryList,
} from "@/services/workouts/history/client";
import type {
  WorkoutHistoryListResponse,
  WorkoutHistorySessionDetailResponse,
} from "@/types/workout-history";

const ownerId = "11111111-1111-4111-8111-111111111111";
const detailId = "22222222-2222-4222-8222-222222222222";
const mockOwnerId = "00000000-0000-4000-8000-000000000001";
const request = {
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-09-01T00:00:00.000Z",
  timezone: "UTC",
  limit: 20,
} as const;

function response(
  marker: string,
): WorkoutHistoryListResponse & { marker: string } {
  return {
    marker,
    contractVersion: 1,
    period: {
      from: request.from,
      to: request.to,
      timezone: request.timezone,
    },
    summary: {
      eligibleWorkoutCount: 0,
      trustedDurationMinutes: null,
      completedSetCount: null,
      reliableVolume: null,
      verifiedRecordCount: null,
    },
    items: [],
    nextCursor: null,
    notices: [],
  };
}

function detailResponse(): WorkoutHistorySessionDetailResponse {
  return {
    contractVersion: 1,
    activity: {
      contractVersion: 1,
      activityId: `performed:${detailId}`,
      canonicalSessionId: detailId,
      scheduledSessionId: null,
      userId: ownerId,
      sourceKind: "performed",
      lifecycle: "completed",
      title: "Session",
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
        showMuscleAnalysis: true,
        calculatePerformanceMetrics: true,
        calculateVerifiedRecords: true,
        repeatWorkout: true,
        correctSession: true,
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
    notices: [],
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Workout History authenticated browser client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.useMockAuth = false;
    mocks.env.productionQaBuild = false;
    mocks.resolveCompatibilityToken.mockResolvedValue(
      "compatibility-token",
    );
    mocks.readCache.mockResolvedValue(null);
    mocks.writeCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the explicit access token without resolving another session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(response("online")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getWorkoutHistoryList(ownerId, request, {
        accessToken: "owner-token",
      }),
    ).resolves.toMatchObject({ marker: "online" });

    expect(mocks.resolveCompatibilityToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain(
      "owner-token",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer owner-token",
      },
    });
  });

  it("fails safely when an online authenticated request has no token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getWorkoutHistoryList(ownerId, request, {
        accessToken: null,
      }),
    ).rejects.toMatchObject({
      code: "sign_in_required",
      status: 401,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.resolveCompatibilityToken).not.toHaveBeenCalled();
  });

  it("returns a successful online response without waiting for IndexedDB", async () => {
    let finishWrite!: () => void;
    mocks.writeCache.mockReturnValue(
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(response("online"))),
    );

    await expect(
      getWorkoutHistoryList(ownerId, request, {
        accessToken: "owner-token",
      }),
    ).resolves.toMatchObject({ marker: "online" });
    expect(mocks.writeCache).toHaveBeenCalledOnce();
    finishWrite();
  });

  it("does not let a stale same-filter request overwrite the newer cached result", async () => {
    let resolveOlder!: (value: Response) => void;
    let resolveNewer!: (value: Response) => void;
    const older = new Promise<Response>((resolve) => {
      resolveOlder = resolve;
    });
    const newer = new Promise<Response>((resolve) => {
      resolveNewer = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(older)
        .mockReturnValueOnce(newer),
    );

    const olderRead = getWorkoutHistoryList(ownerId, request, {
      accessToken: "owner-token",
    });
    const newerRead = getWorkoutHistoryList(ownerId, request, {
      accessToken: "owner-token",
    });
    resolveNewer(jsonResponse(response("newer")));
    await expect(newerRead).resolves.toMatchObject({
      marker: "newer",
    });
    resolveOlder(jsonResponse(response("older")));
    await expect(olderRead).resolves.toMatchObject({
      marker: "older",
    });

    expect(mocks.writeCache).toHaveBeenCalledOnce();
    expect(mocks.writeCache.mock.calls[0]?.[3]).toMatchObject({
      marker: "newer",
    });
  });

  it("keeps tokens out of URLs and owner-scoped cache keys", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(response("a")))
      .mockResolvedValueOnce(jsonResponse(response("b")));
    vi.stubGlobal("fetch", fetchMock);

    await getWorkoutHistoryList(ownerId, request, {
      accessToken: "token-a",
    });
    await getWorkoutHistoryList(ownerId, request, {
      accessToken: "token-b",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      fetchMock.mock.calls[1]?.[0],
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(
      "token-a",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain(
      "token-b",
    );
    expect(mocks.writeCache.mock.calls[0]?.[2]).toBe(
      mocks.writeCache.mock.calls[1]?.[2],
    );
  });

  it("uses the explicit token for detail requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(detailResponse()));
    vi.stubGlobal("fetch", fetchMock);

    await getWorkoutHistoryDetail(
      ownerId,
      "performed",
      detailId,
      { accessToken: "detail-token" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/workouts/history/${detailId}`,
      expect.objectContaining({
        headers: {
          Authorization: "Bearer detail-token",
        },
      }),
    );
    expect(mocks.resolveCompatibilityToken).not.toHaveBeenCalled();
  });

  it("preserves owner-scoped offline cache and stale notices without a token lookup", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    mocks.readCache.mockResolvedValue(response("cached"));

    await expect(
      getWorkoutHistoryList(ownerId, request, {
        accessToken: null,
      }),
    ).resolves.toMatchObject({
      marker: "cached",
      notices: ["stale-data"],
    });

    expect(mocks.readCache).toHaveBeenCalledWith(
      ownerId,
      "list",
      expect.any(String),
    );
    expect(mocks.resolveCompatibilityToken).not.toHaveBeenCalled();
  });

  it("keeps mock-auth list reads in memory without a session or browser request", async () => {
    mocks.env.useMockAuth = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await getWorkoutHistoryList(
      mockOwnerId,
      {
        ...request,
        from: "2000-01-01T00:00:00.000Z",
        to: "2100-01-01T00:00:00.000Z",
      },
      { accessToken: null },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.resolveCompatibilityToken).not.toHaveBeenCalled();
  });

  it("keeps the legacy canonical reader behind one explicit compatibility token boundary", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(response("legacy")));
    vi.stubGlobal("fetch", fetchMock);

    await getCanonicalWorkoutActivity(ownerId, 1);

    expect(mocks.resolveCompatibilityToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
