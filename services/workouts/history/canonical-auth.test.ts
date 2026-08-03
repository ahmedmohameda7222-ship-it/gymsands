import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  env: { useMockAuth: false, productionQaBuild: false },
  getSession: vi.fn(),
  getUser: vi.fn(),
  readCache: vi.fn(),
  writeCache: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: mocks.getUser,
    },
  },
}));
vi.mock("@/lib/workouts/history/offline-cache", () => ({
  readWorkoutHistoryCache: mocks.readCache,
  writeWorkoutHistoryCache: mocks.writeCache,
}));

import {
  getCanonicalWorkoutActivity,
  getCanonicalWorkoutActivityWithCompatibilitySession,
} from "@/services/workouts/history/client";

function listResponse() {
  return new Response(
    JSON.stringify({
      contractVersion: 1,
      period: {
        from: "2026-01-01T00:00:00.000Z",
        to: "2027-01-01T00:00:00.000Z",
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
      filterOptions: {
        workoutTypes: [],
        muscles: [],
        exercises: [],
        plans: [],
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("canonical Workout History reader authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readCache.mockResolvedValue(null);
    mocks.writeCache.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "compat-token" } },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse()));
  });

  it("uses an explicit token with zero compatibility session or user lookups", async () => {
    await getCanonicalWorkoutActivity(ownerId, 1, {
      accessToken: "progress-token",
    });

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      expect.not.stringContaining("progress-token"),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer progress-token",
        },
      }),
    );
  });

  it("does not fall back to compatibility auth when an explicit context has no token", async () => {
    await expect(
      getCanonicalWorkoutActivity(ownerId, 1, {
        accessToken: null,
      }),
    ).rejects.toMatchObject({
      code: "sign_in_required",
      status: 401,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("resolves a session only through the explicitly named legacy compatibility reader", async () => {
    await getCanonicalWorkoutActivityWithCompatibilitySession(ownerId, 1);

    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer compat-token",
        },
      }),
    );
  });
});
