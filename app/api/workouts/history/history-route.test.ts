import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  filterOptions: vi.fn(),
  list: vi.fn(),
  rateLimit: vi.fn(() => null as Response | null),
  requireUser: vi.fn(),
  scheduledDetail: vi.fn(),
  sharedMetrics: vi.fn(),
}));

vi.mock("@/lib/integrations/env", () => ({
  requireUser: mocks.requireUser,
  serverEnv: { workoutHistoryCursorSecret: "route-test-secret-that-is-at-least-32-characters" },
}));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/services/workouts/history/filter-options", () => ({
  readWorkoutHistoryFilterOptions: mocks.filterOptions,
}));
vi.mock("@/services/workouts/history/server-list-reader", () => ({
  listWorkoutHistoryKeyset: mocks.list,
}));
vi.mock("@/services/workouts/history/shared-session-metrics", () => ({
  readSharedWorkoutHistorySessionMetrics: mocks.sharedMetrics,
}));
vi.mock("@/services/workouts/history/server-reader", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/workouts/history/server-reader")>();
  return {
    ...original,
    getScheduledWorkoutHistoryDetail: mocks.scheduledDetail,
    getWorkoutHistorySessionDetail: mocks.detail,
  };
});

import { GET as getList } from "@/app/api/workouts/history/route";
import { GET as getDetail } from "@/app/api/workouts/history/[sessionId]/route";
import { GET as getScheduledDetail } from "@/app/api/workouts/history/scheduled/[scheduledSessionId]/route";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";

const ownerId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const supabase = { from: vi.fn(), rpc: vi.fn() };
const periodOptions = {
  workoutTypes: [{ value: "strength", label: "Strength" }],
  muscles: [{ value: "pectoralis_major", label: "Pectoralis Major" }],
  exercises: [{ value: "global:exercise", label: "Bench press" }],
  plans: [{ value: "plan", label: "Strength plan" }],
};

describe("Workout History API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.requireUser.mockResolvedValue({ user: { id: ownerId }, supabase });
    mocks.list.mockResolvedValue({
      contractVersion: 1,
      period: { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z", timezone: "UTC" },
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
      filterOptions: { workoutTypes: [], muscles: [], exercises: [], plans: [] },
    });
    mocks.filterOptions.mockResolvedValue(periodOptions);
    mocks.sharedMetrics.mockResolvedValue({ externalLoadVolume: 0 });
  });

  it("applies rate limiting before authentication and preserves no-store headers", async () => {
    mocks.rateLimit.mockReturnValueOnce(NextResponse.json({ error: "limited" }, { status: 429 }));

    const response = await getList(new Request("https://plaivra.test/api/workouts/history"));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("requires the authenticated owner and attaches period-wide first-page options", async () => {
    const unauthorized = NextResponse.json({ error: "Sign in required." }, { status: 401 });
    mocks.requireUser.mockResolvedValueOnce(unauthorized);
    expect((await getList(new Request("https://plaivra.test/api/workouts/history"))).status)
      .toBe(401);

    const response = await getList(new Request(
      "https://plaivra.test/api/workouts/history?from=2026-08-01T00%3A00%3A00Z&to=2026-09-01T00%3A00%3A00Z&timezone=UTC&limit=25&search=%20Push%20%20Day%20&status=completed&sort=oldest",
      { headers: { Authorization: "Bearer owner-token" } },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledWith(
      supabase,
      ownerId,
      expect.objectContaining({
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
        limit: 25,
        search: "Push Day",
        statuses: ["completed"],
        sort: "oldest",
      }),
      expect.any(String),
    );
    expect(mocks.filterOptions).toHaveBeenCalledWith(
      supabase,
      ownerId,
      expect.objectContaining({ search: "Push Day", statuses: ["completed"] }),
    );
    expect(await response.json()).toMatchObject({ filterOptions: periodOptions });
  });

  it("does not repeat the period filter-option scan for cursor pages", async () => {
    const response = await getList(new Request(
      "https://plaivra.test/api/workouts/history?cursor=opaque-signed-cursor",
      { headers: { Authorization: "Bearer owner-token" } },
    ));
    expect(response.status).toBe(200);
    expect(mocks.filterOptions).not.toHaveBeenCalled();
  });

  it("rejects invalid periods, limits, filters, and oversized cursors with stable codes", async () => {
    const cases = [
      ["?from=bad&to=worse&timezone=UTC", "invalid_period"],
      ["?limit=51", "invalid_limit"],
      ["?status=forged", "invalid_filters"],
      [`?cursor=${"a".repeat(1025)}`, "invalid_cursor"],
    ] as const;
    for (const [query, code] of cases) {
      const response = await getList(new Request(`https://plaivra.test/api/workouts/history${query}`));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code });
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns generic not-found detail responses and never exposes another owner", async () => {
    const invalid = await getDetail(
      new Request("https://plaivra.test/api/workouts/history/not-a-uuid"),
      { params: Promise.resolve({ sessionId: "not-a-uuid" }) },
    );
    expect(invalid.status).toBe(404);
    expect(await invalid.json()).toEqual({
      error: "Workout history item was not found.",
      code: "history_not_found",
    });
    expect(mocks.detail).not.toHaveBeenCalled();

    mocks.detail.mockRejectedValueOnce(new WorkoutHistoryReaderError(
      "history_not_found",
      "Workout history item was not found.",
      404,
    ));
    const missing = await getDetail(
      new Request(`https://plaivra.test/api/workouts/history/${sessionId}`),
      { params: Promise.resolve({ sessionId }) },
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "history_not_found" });
    expect(mocks.detail).toHaveBeenCalledWith(supabase, ownerId, sessionId);
  });

  it("replaces compatibility volume with the shared AW-8 metric result", async () => {
    mocks.detail.mockResolvedValue({
      contractVersion: 1,
      activity: {},
      summary: { reliableVolume: 123 },
      exercises: [],
      timeline: [],
      notices: [],
    });
    mocks.sharedMetrics.mockResolvedValue({ externalLoadVolume: 500 });
    const response = await getDetail(
      new Request(`https://plaivra.test/api/workouts/history/${sessionId}`),
      { params: Promise.resolve({ sessionId }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      summary: { reliableVolume: 500 },
    });
    expect(mocks.sharedMetrics).toHaveBeenCalledWith(supabase, ownerId, sessionId);
  });

  it("keeps performed and scheduled detail namespaces separate", async () => {
    mocks.scheduledDetail.mockResolvedValue({ contractVersion: 1, activity: {}, exercises: [], notices: [] });

    const response = await getScheduledDetail(
      new Request(`https://plaivra.test/api/workouts/history/scheduled/${sessionId}`),
      { params: Promise.resolve({ scheduledSessionId: sessionId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.scheduledDetail).toHaveBeenCalledWith(supabase, ownerId, sessionId);
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("redacts unexpected database details", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.list.mockRejectedValueOnce(new Error("relation private_member_data does not exist"));

    const response = await getList(new Request("https://plaivra.test/api/workouts/history"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Workout history could not load.",
      code: "history_unavailable",
    });
    errorSpy.mockRestore();
  });
});
