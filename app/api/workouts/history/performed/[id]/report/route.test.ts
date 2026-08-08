import { readFileSync } from "node:fs";

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const sessionId = "20000000-0000-4000-8000-000000000002";
const supabase = { identity: "member-rls-client" };

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  detail: vi.fn(),
  rateLimit: vi.fn(),
  render: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/integrations/env", () => ({
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/integrations/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/reports/workout/model", () => ({
  buildWorkoutReportModel: mocks.build,
}));
vi.mock("@/lib/reports/workout/render", () => ({
  renderWorkoutReport: mocks.render,
}));
vi.mock("@/services/workouts/history/server-reader", () => {
  class WorkoutHistoryReaderError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "WorkoutHistoryReaderError";
    }
  }
  return {
    getWorkoutHistorySessionDetail: mocks.detail,
    WorkoutHistoryReaderError,
  };
});

import { GET } from "@/app/api/workouts/history/performed/[id]/report/route";
import { PdfReportError } from "@/lib/reports/pdf/errors";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";

function request(query = "language=en&timezone=Europe%2FBerlin") {
  return new Request(
    `https://app.plaivra.com/api/workouts/history/performed/${sessionId}/report?${query}`,
    { headers: { Authorization: "Bearer member-token" } },
  );
}

function params(id = sessionId) {
  return { params: Promise.resolve({ id }) };
}

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe(
    "private, no-store, max-age=0",
  );
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("vary")).toBe("Authorization");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockReturnValue(null);
  mocks.requireUser.mockResolvedValue({
    user: { id: ownerId },
    supabase,
  });
  mocks.detail.mockResolvedValue({
    activity: {
      sourceKind: "performed",
      effectiveAt: "2026-08-05T22:30:00.000Z",
    },
    summary: { reliableVolume: 0 },
  });
  mocks.build.mockReturnValue({ report: "model" });
  const bytes = new TextEncoder().encode("%PDF-route-test");
  mocks.render.mockResolvedValue({
    bytes,
    byteCount: bytes.byteLength,
    pageCount: 1,
    generationMs: 1,
  });
});

describe("P8A performed workout report route", () => {
  it("uses member-scoped canonical detail data and returns a private PDF download", async () => {
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
    expectPrivateHeaders(response);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="plaivra-workout-report-2026-08-06.pdf"',
    );
    expect(mocks.detail).toHaveBeenCalledWith(supabase, ownerId, sessionId);
    expect(mocks.build).toHaveBeenCalledWith({
      detail: expect.objectContaining({
        summary: { reliableVolume: 0 },
      }),
      language: "en",
      timezone: "Europe/Berlin",
    });
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
      "%PDF-route-test",
    );
  });

  it.each([
    ["language=fr&timezone=UTC", "report_invalid_language"],
    ["language=en&language=de&timezone=UTC", "report_invalid_language"],
    ["language=en&timezone=Not%2FAZone", "report_invalid_timezone"],
    ["language=en&timezone=UTC&timezone=Europe%2FBerlin", "report_invalid_timezone"],
  ])("rejects invalid query input without authentication: %s", async (query, code) => {
    const response = await GET(request(query), params());
    expect(response.status).toBe(400);
    expectPrivateHeaders(response);
    expect(await response.json()).toMatchObject({ code });
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("returns safe 404 for a malformed or owner-inaccessible session", async () => {
    const malformed = await GET(request(), params("not-a-uuid"));
    expect(malformed.status).toBe(404);
    expectPrivateHeaders(malformed);
    expect(mocks.requireUser).not.toHaveBeenCalled();

    mocks.detail.mockRejectedValueOnce(
      new WorkoutHistoryReaderError(
        "history_not_found",
        "private internal relation detail",
        404,
      ),
    );
    const inaccessible = await GET(request(), params());
    expect(inaccessible.status).toBe(404);
    expect(await inaccessible.json()).toEqual({
      error: "Workout history item was not found.",
      code: "history_not_found",
    });
  });

  it("preserves authenticated denial and rate-limit responses with report privacy headers", async () => {
    mocks.requireUser.mockResolvedValueOnce(
      NextResponse.json({ error: "Sign in required." }, { status: 401 }),
    );
    const denied = await GET(request(), params());
    expect(denied.status).toBe(401);
    expectPrivateHeaders(denied);

    mocks.rateLimit.mockReturnValueOnce(
      NextResponse.json({ error: "limited" }, { status: 429 }),
    );
    const limited = await GET(request(), params());
    expect(limited.status).toBe(429);
    expectPrivateHeaders(limited);
  });

  it("returns a safe canonical-reader failure without leaking internals", async () => {
    mocks.detail.mockRejectedValueOnce(
      new WorkoutHistoryReaderError(
        "history_read_failed",
        "private database relation failure",
        503,
      ),
    );
    const response = await GET(request(), params());
    expect(response.status).toBe(503);
    expectPrivateHeaders(response);
    const body = await response.json();
    expect(body).toEqual({
      error: "The workout report could not be prepared.",
      code: "report_unavailable",
    });
    expect(JSON.stringify(body)).not.toContain("private database relation failure");
  });

  it("returns explicit bounded failure without leaking content", async () => {
    mocks.render.mockRejectedValueOnce(
      new PdfReportError("REPORT_TOO_LARGE", "private oversized note"),
    );
    const response = await GET(request(), params());
    expect(response.status).toBe(413);
    expectPrivateHeaders(response);
    const body = await response.json();
    expect(body).toEqual({
      error: "The workout report is too large to generate safely.",
      code: "REPORT_TOO_LARGE",
    });
    expect(JSON.stringify(body)).not.toContain("private oversized note");
  });

  it("does not expose scheduled fallback data through the performed report route", async () => {
    mocks.detail.mockResolvedValueOnce({
      activity: {
        sourceKind: "scheduled_fallback",
        effectiveAt: "2026-08-05T22:30:00.000Z",
      },
      summary: { reliableVolume: null },
    });
    const response = await GET(request(), params());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Workout history item was not found.",
      code: "history_not_found",
    });
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("contains no service-role, self-fetch, or database mutation path", () => {
    const source = readFileSync(
      "app/api/workouts/history/performed/[id]/report/route.ts",
      "utf8",
    );
    expect(source).toContain("getWorkoutHistorySessionDetail");
    expect(source).toContain("context.supabase");
    expect(source).not.toContain("shared-session-metrics");
    expect(source).not.toContain("KnownOwnerScopedSession");
    expect(source).not.toMatch(/service.?role/iu);
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/u);
  });

});
