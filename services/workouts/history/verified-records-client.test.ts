import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: mocks.getUser,
    },
  },
}));

import {
  refreshVerifiedRecordsAuthenticated,
  refreshVerifiedRecordsWithCompatibilitySession,
} from "@/services/workouts/history/verified-records-client";

function successfulResponse() {
  return new Response(
    JSON.stringify({
      session_id: sessionId,
      record_count: 1,
      schema_version: 1,
      formula_version: "v1",
      status: "current",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("verified-record projection repair authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "compat-token" } },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulResponse()));
  });

  it("uses the explicit AuthProvider token with zero session or user lookups", async () => {
    const controller = new AbortController();

    await expect(
      refreshVerifiedRecordsAuthenticated(sessionId, {
        accessToken: "owner-token",
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ status: "current" });

    expect(fetch).toHaveBeenCalledWith(
      `/api/workouts/history/${sessionId}/verified-records`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer owner-token",
        }),
        signal: controller.signal,
      }),
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("fails safely before the browser request when the explicit token is missing", async () => {
    await expect(
      refreshVerifiedRecordsAuthenticated(sessionId, {
        accessToken: null,
      }),
    ).resolves.toBeNull();

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("does not start an aborted repair request", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      refreshVerifiedRecordsAuthenticated(sessionId, {
        accessToken: "owner-token",
        signal: controller.signal,
      }),
    ).resolves.toBeNull();

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("keeps the legacy lookup behind the explicitly named compatibility wrapper", async () => {
    await refreshVerifiedRecordsWithCompatibilitySession(sessionId);

    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      `/api/workouts/history/${sessionId}/verified-records`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer compat-token",
        }),
      }),
    );
  });
});
