import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rateLimit: vi.fn(() => null),
  getAnalysis: vi.fn()
}));

vi.mock("@/lib/integrations/env", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/train/muscle-intelligence/session-analysis", async (importOriginal) => {
  const original = await importOriginal<typeof import("./session-analysis")>();
  return { ...original, getWorkoutSessionMuscleAnalysis: mocks.getAnalysis };
});

import { GET } from "@/app/api/workouts/sessions/[id]/muscle-analysis/route";
import { SessionMuscleAnalysisError } from "./session-analysis";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id: sessionId }) };

describe("GET /api/workouts/sessions/[id]/muscle-analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: { from: vi.fn(), rpc: vi.fn() } });
  });

  it("requires authentication and rejects invalid modes before analysis", async () => {
    mocks.requireUser.mockResolvedValueOnce(NextResponse.json({ error: "Sign in required." }, { status: 401 }));
    const unauthorized = await GET(new Request(`https://plaivra.test/api/workouts/sessions/${sessionId}/muscle-analysis`), context);
    expect(unauthorized.status).toBe(401);

    const invalid = await GET(new Request(`https://plaivra.test/api/workouts/sessions/${sessionId}/muscle-analysis?mode=forged`), context);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "invalid_analysis_mode" });
    expect(mocks.getAnalysis).not.toHaveBeenCalled();
  });

  it("passes only the authenticated owner and requested session to the service", async () => {
    mocks.getAnalysis.mockResolvedValue({ sessionId, snapshotId: "snapshot-1", analysis: { mode: "completed" } });
    const response = await GET(new Request(`https://plaivra.test/api/workouts/sessions/${sessionId}/muscle-analysis?mode=completed`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getAnalysis).toHaveBeenCalledWith(expect.anything(), userId, sessionId, "completed");
  });

  it.each([
    ["snapshot_not_found", 404],
    ["session_not_terminal", 409]
  ] as const)("returns the bounded %s service error", async (code, status) => {
    mocks.getAnalysis.mockRejectedValue(new SessionMuscleAnalysisError(code, "Safe historical analysis error.", status));
    const response = await GET(new Request(`https://plaivra.test/api/workouts/sessions/${sessionId}/muscle-analysis?mode=completed`), context);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Safe historical analysis error.", code });
  });

  it("redacts unexpected database details", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getAnalysis.mockRejectedValue(new Error("relation private_secret does not exist"));
    const response = await GET(new Request(`https://plaivra.test/api/workouts/sessions/${sessionId}/muscle-analysis`), context);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Historical muscle analysis could not be generated.", code: "analysis_failed" });
    errorSpy.mockRestore();
  });
});
