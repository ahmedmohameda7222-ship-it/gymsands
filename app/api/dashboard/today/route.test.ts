import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTodayProjectionFixture } from "@/lib/dashboard/testing/today-projection-fixture";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const requestId = "today-request-safe-1";
const timings = {
  workout: 1,
  meals: 1,
  nutrition_logs: 1,
  nutrition_targets: 1,
  hydration: 1,
  shopping: 1,
  habits: 1,
  supplements: 1,
  sleep: 1,
  profile_context: 1,
  progress_context: 1,
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rateLimit: vi.fn(),
  read: vi.fn(),
  resolveRequestId: vi.fn(() => "today-request-safe-1"),
  log: vi.fn(),
}));

vi.mock("@/lib/integrations/env", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/observability/correlation-id", () => ({
  REQUEST_ID_HEADER: "x-request-id",
  resolveOperationalCorrelationId: mocks.resolveRequestId,
}));
vi.mock("@/lib/observability/structured-log", () => ({
  logOperationalEvent: mocks.log,
}));
vi.mock("@/services/dashboard/today-projection-server", () => ({
  readTodayProjectionV1: mocks.read,
}));

import { GET } from "@/app/api/dashboard/today/route";

function request(
  query = "date=2026-08-03&timezone=Europe%2FBerlin",
  correlationId = "incoming-request-id",
) {
  return new Request(`https://app.plaivra.com/api/dashboard/today?${query}`, {
    headers: {
      Authorization: "Bearer route-token",
      "x-request-id": correlationId,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveRequestId.mockReturnValue(requestId);
  mocks.rateLimit.mockReturnValue(null);
  mocks.requireUser.mockResolvedValue({
    supabase: { identity: "rls-client" },
    user: { id: ownerId },
    accessToken: "route-token",
  });
  mocks.read.mockResolvedValue({
    response: createTodayProjectionFixture(),
    timings,
  });
});

describe("GET /api/dashboard/today", () => {
  it("authenticates, derives owner identity, and returns private versioned headers", async () => {
    const response = await GET(
      request(`date=2026-08-03&timezone=Europe%2FBerlin&userId=${otherId}`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(createTodayProjectionFixture());
    expect(mocks.resolveRequestId).toHaveBeenCalledWith("incoming-request-id");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: { identity: "rls-client" },
        userId: ownerId,
        date: "2026-08-03",
        timezone: "Europe/Berlin",
      }),
    );
    expect(mocks.read.mock.calls[0][0].userId).not.toBe(otherId);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Plaivra-Today-Contract")).toBe("1");
    expect(response.headers.get("Server-Timing")).toMatch(
      /^total;dur=\d+\.\d, workout;dur=1\.0/,
    );
    expect(response.headers.get("X-Plaivra-Server-Timing")).toBe(
      response.headers.get("Server-Timing"),
    );
    expect(response.headers.get("Server-Timing")).not.toMatch(
      /11111111|2026-08-03|route-token|profiles/i,
    );
  });

  it.each([
    ["missing date", "timezone=Europe%2FBerlin"],
    ["invalid date", "date=2026-02-30&timezone=Europe%2FBerlin"],
    ["missing timezone", "date=2026-08-03"],
    ["invalid timezone", "date=2026-08-03&timezone=Private%2FDatabase"],
  ])("returns a safe 400 for %s", async (_label, query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "A valid date and timezone are required.",
      code: "today_request_invalid",
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each([
    [401, { error: "Your session expired." }],
    [403, { error: "Account access denied.", code: "account_deletion_processing" }],
  ])("preserves authenticated account response %i before domain reads", async (status, body) => {
    mocks.requireUser.mockResolvedValue(
      NextResponse.json(body, { status }),
    );
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("logs allowlisted domain outcomes without request or response private data", async () => {
    const fixture = createTodayProjectionFixture();
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.log).toHaveBeenCalledTimes(11);
    expect(mocks.log).toHaveBeenCalledWith({
      event: "today_projection_domain_completed",
      level: "info",
      request_id: requestId,
      operation: "workout",
      duration_ms: 1,
      error_code: undefined,
    });
    const serialized = JSON.stringify(mocks.log.mock.calls);
    expect(serialized).not.toContain(ownerId);
    expect(serialized).not.toContain("route-token");
    expect(serialized).not.toContain("2026-08-03");
    expect(serialized).not.toContain("Europe/Berlin");
    expect(serialized).not.toContain(fixture.generatedAt);
    expect(serialized).not.toMatch(/private|notes|supabase|payload/i);
  });

  it("returns 200 and logs only safe codes when optional domains fail", async () => {
    const fixture = createTodayProjectionFixture();
    const error = (code: string) => ({
      state: "failed" as const,
      value: null,
      errorCode: code,
    });
    mocks.read.mockResolvedValue({
      response: {
        ...fixture,
        workout: error("workout_unavailable"),
        meals: error("meals_unavailable"),
        nutrition: {
          logs: error("nutrition_logs_unavailable"),
          targets: error("nutrition_targets_unavailable"),
        },
        hydration: error("hydration_unavailable"),
        shopping: error("shopping_unavailable"),
        wellness: {
          state: "failed",
          habits: error("habits_unavailable"),
          supplements: error("supplements_unavailable"),
          sleep: error("sleep_unavailable"),
        },
        profileContext: error("profile_context_unavailable"),
        progressContext: error("progress_context_unavailable"),
      },
      timings,
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).wellness.state).toBe("failed");
    expect(mocks.log).toHaveBeenCalledWith({
      event: "today_projection_domain_completed",
      level: "warn",
      request_id: requestId,
      operation: "workout",
      duration_ms: 1,
      error_code: "workout_unavailable",
    });
    const serialized = JSON.stringify(mocks.log.mock.calls);
    expect(serialized).not.toMatch(/raw|relation|token=|private_health|user_id/i);
  });

  it("maps a projection-boundary failure to safe response and safe correlated log", async () => {
    mocks.read.mockRejectedValue(
      new Error("relation private_health_notes does not exist token=secret"),
    );
    const response = await GET(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      error: "Today could not load.",
      code: "today_projection_unavailable",
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("Server-Timing")).toMatch(/^total;dur=\d+\.\d$/);
    expect(mocks.log).toHaveBeenCalledOnce();
    expect(mocks.log).toHaveBeenCalledWith({
      event: "today_projection_request_failed",
      level: "error",
      request_id: requestId,
      operation: "projection",
      duration_ms: expect.any(Number),
      error_code: "today_projection_unavailable",
    });
    const combined = JSON.stringify({ body, logs: mocks.log.mock.calls });
    expect(combined).not.toMatch(/private_health|token=secret|relation|ownerId/i);
  });

  it("uses the existing rate-limit authority and adds privacy headers", async () => {
    mocks.rateLimit.mockReturnValue(
      NextResponse.json({ error: "Too many requests." }, { status: 429 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(response.headers.get("X-Plaivra-Today-Contract")).toBe("1");
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("contains no service-role or external-provider route path", () => {
    const source = readFileSync("app/api/dashboard/today/route.ts", "utf8");
    expect(source).toContain("requireUser(request)");
    expect(source).toContain("resolveOperationalCorrelationId");
    expect(source).toContain("logOperationalEvent");
    expect(source).not.toMatch(/serviceRole|service_role|SUPABASE_SERVICE_ROLE/i);
    expect(source).not.toContain("fetch(");
  });
});
