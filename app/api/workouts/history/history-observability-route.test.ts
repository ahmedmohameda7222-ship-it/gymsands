import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const safeRequestId = "history-safe-request";
const supabase = { identity: "rls-client" };
const filterOptions = {
  workoutTypes: [],
  muscles: [],
  exercises: [],
  plans: [],
};

const listResponse = {
  contractVersion: 1,
  period: {
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-09-01T00:00:00.000Z",
    timezone: "UTC",
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
  filterOptions,
};

const mocks = vi.hoisted(() => ({
  filterOptions: vi.fn(),
  list: vi.fn(),
  log: vi.fn(),
  rateLimit: vi.fn(),
  requireUser: vi.fn(),
  resolveRequestId: vi.fn(),
}));

vi.mock("@/lib/integrations/env", () => ({
  requireUser: mocks.requireUser,
  serverEnv: {
    workoutHistoryCursorSecret:
      "route-test-secret-that-is-at-least-32-characters",
  },
}));
vi.mock("@/lib/integrations/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/observability/correlation-id", () => ({
  REQUEST_ID_HEADER: "x-request-id",
  resolveOperationalCorrelationId: mocks.resolveRequestId,
}));
vi.mock("@/lib/observability/structured-log", () => ({
  logOperationalEvent: mocks.log,
}));
vi.mock("@/services/workouts/history/filter-options", () => ({
  readWorkoutHistoryFilterOptions: mocks.filterOptions,
}));
vi.mock("@/services/workouts/history/server-list-reader", () => ({
  listWorkoutHistoryKeyset: mocks.list,
}));

import { GET } from "@/app/api/workouts/history/route";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";

function request(query = "", requestId = "incoming-valid-id") {
  return new Request(
    `https://app.plaivra.com/api/workouts/history${query}`,
    {
      headers: {
        Authorization: "Bearer fake-route-token",
        "x-request-id": requestId,
      },
    },
  );
}

function expectSharedHeaders(response: Response, requestId = safeRequestId) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Authorization");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-request-id")).toBe(requestId);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveRequestId.mockImplementation((value: string | null) =>
    value === "incoming-valid-id" ? value : safeRequestId,
  );
  mocks.rateLimit.mockReturnValue(null);
  mocks.requireUser.mockResolvedValue({
    user: { id: ownerId, email: "private@example.test" },
    supabase,
  });
  mocks.list.mockResolvedValue(listResponse);
  mocks.filterOptions.mockResolvedValue(filterOptions);
});

describe("Workout History list request observability", () => {
  it("returns first-page correlation, privacy headers, and total/list/filters timing", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expectSharedHeaders(response, "incoming-valid-id");
    expect(response.headers.get("server-timing")).toMatch(
      /^total;dur=\d+\.\d, list;dur=\d+\.\d, filters;dur=\d+\.\d$/,
    );
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.filterOptions).toHaveBeenCalledOnce();
    expect(mocks.log).toHaveBeenCalledOnce();
    expect(mocks.log).toHaveBeenCalledWith({
      event: "workout_history_list_request_completed",
      level: "info",
      request_id: "incoming-valid-id",
      operation: "first_page",
      outcome: "success",
      duration_ms: expect.any(Number),
      error_code: undefined,
      result_count: 0,
    });
  });

  it("returns cursor total/list timing without a fabricated filters metric", async () => {
    const response = await GET(request("?cursor=opaque-signed-cursor"));
    expect(response.status).toBe(200);
    expectSharedHeaders(response, "incoming-valid-id");
    expect(response.headers.get("server-timing")).toMatch(
      /^total;dur=\d+\.\d, list;dur=\d+\.\d$/,
    );
    expect(response.headers.get("server-timing")).not.toContain("filters");
    expect(mocks.filterOptions).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "cursor_page",
        outcome: "success",
      }),
    );
  });

  it("reuses a valid request ID and replaces an invalid one", async () => {
    const reused = await GET(request("", "incoming-valid-id"));
    expect(reused.headers.get("x-request-id")).toBe("incoming-valid-id");
    expect(mocks.resolveRequestId).toHaveBeenCalledWith("incoming-valid-id");

    const replaced = await GET(request("", "invalid id with spaces"));
    expect(replaced.headers.get("x-request-id")).toBe(safeRequestId);
    expect(mocks.resolveRequestId).toHaveBeenCalledWith(
      "invalid id with spaces",
    );
  });

  it("adds safe shared headers to rate-limit responses without fabricated timing", async () => {
    mocks.rateLimit.mockReturnValueOnce(
      NextResponse.json({ error: "limited" }, { status: 429 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(429);
    expectSharedHeaders(response, "incoming-valid-id");
    expect(response.headers.get("server-timing")).toBeNull();
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "first_page",
        outcome: "rejected",
      }),
    );
  });

  it("adds safe shared headers to validation responses without fabricated timing", async () => {
    const response = await GET(request("?limit=99"));
    expect(response.status).toBe(400);
    expectSharedHeaders(response, "incoming-valid-id");
    expect(response.headers.get("server-timing")).toBeNull();
    expect(await response.json()).toMatchObject({ code: "invalid_limit" });
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "invalid_request",
        error_code: "invalid_limit",
      }),
    );
  });

  it.each([
    [401, { error: "Sign in required." }],
    [403, { error: "Account access denied.", code: "account_denied" }],
  ])("adds safe shared headers to authenticated denial %i", async (status, body) => {
    mocks.requireUser.mockResolvedValueOnce(
      NextResponse.json(body, { status }),
    );
    const response = await GET(request());
    expect(response.status).toBe(status);
    expectSharedHeaders(response, "incoming-valid-id");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "first_page",
        outcome: "rejected",
      }),
    );
  });

  it("preserves safe reader status and code with total-only failure timing", async () => {
    mocks.list.mockRejectedValueOnce(
      new WorkoutHistoryReaderError(
        "history_cursor_invalid",
        "Workout history cursor is invalid.",
        400,
      ),
    );
    const response = await GET(request("?cursor=opaque-signed-cursor"));
    expect(response.status).toBe(400);
    expectSharedHeaders(response, "incoming-valid-id");
    expect(response.headers.get("server-timing")).toMatch(
      /^total;dur=\d+\.\d$/,
    );
    expect(await response.json()).toEqual({
      error: "Workout history cursor is invalid.",
      code: "history_cursor_invalid",
    });
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "cursor_page",
        outcome: "failed_closed",
        error_code: "history_cursor_invalid",
      }),
    );
  });

  it("excludes raw unexpected failures and private request data from response and logs", async () => {
    mocks.list.mockRejectedValueOnce(
      new Error(
        "relation private_member_notes failed token=secret cursor=opaque search=Push",
      ),
    );
    const response = await GET(
      request(
        "?search=Private%20Push&from=2026-08-01T00%3A00%3A00Z&to=2026-09-01T00%3A00%3A00Z&timezone=Europe%2FBerlin",
      ),
    );
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Workout history could not load.",
      code: "history_unavailable",
    });
    const serialized = JSON.stringify({
      body,
      logs: mocks.log.mock.calls,
    });
    expect(serialized).not.toMatch(
      /fake-route-token|private@example|11111111|2026-08-01|Europe\/Berlin|Private Push|opaque|private_member_notes|relation|token=secret|supabase/i,
    );
    expect(mocks.log).toHaveBeenCalledWith({
      event: "workout_history_list_request_completed",
      level: "error",
      request_id: "incoming-valid-id",
      operation: "first_page",
      outcome: "failed_closed",
      duration_ms: expect.any(Number),
      error_code: "history_unavailable",
      result_count: undefined,
    });
  });

  it("keeps first-page list and filter work concurrent", async () => {
    const listDeferred = deferred<typeof listResponse>();
    const filterDeferred = deferred<typeof filterOptions>();
    mocks.list.mockReturnValueOnce(listDeferred.promise);
    mocks.filterOptions.mockReturnValueOnce(filterDeferred.promise);

    const responsePromise = GET(request());
    await vi.waitFor(() => {
      expect(mocks.list).toHaveBeenCalledOnce();
      expect(mocks.filterOptions).toHaveBeenCalledOnce();
    });

    filterDeferred.resolve(filterOptions);
    await Promise.resolve();
    expect(mocks.list).toHaveBeenCalledOnce();

    listDeferred.resolve(listResponse);
    const response = await responsePromise;
    expect(response.status).toBe(200);
  });

  it("contains no service-role list path", () => {
    const source = readFileSync(
      "app/api/workouts/history/route.ts",
      "utf8",
    );
    expect(source).toContain("requireUser(request)");
    expect(source).toContain("Promise.all");
    expect(source).not.toMatch(
      /serviceRole|service_role|SUPABASE_SERVICE_ROLE|createClient\s*\(/i,
    );
  });
});
