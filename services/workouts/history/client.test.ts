import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  readCache: vi.fn(),
  writeCache: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { useMockAuth: false } }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/workouts/history/offline-cache", () => ({
  readWorkoutHistoryCache: mocks.readCache,
  writeWorkoutHistoryCache: mocks.writeCache,
}));

import { getWorkoutHistoryList } from "@/services/workouts/history/client";
import type { WorkoutHistoryListResponse } from "@/types/workout-history";

const ownerId = "11111111-1111-4111-8111-111111111111";
const request = {
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-09-01T00:00:00.000Z",
  timezone: "UTC",
  limit: 20,
} as const;

function response(marker: string): WorkoutHistoryListResponse & { marker: string } {
  return {
    marker,
    contractVersion: 1,
    period: { from: request.from, to: request.to, timezone: request.timezone },
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

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Workout History client cache coordination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "owner-token" } },
      error: null,
    });
    mocks.readCache.mockResolvedValue(null);
  });

  it("returns a successful online response without waiting for IndexedDB", async () => {
    let finishWrite!: () => void;
    mocks.writeCache.mockReturnValue(new Promise<void>((resolve) => {
      finishWrite = resolve;
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(response("online"))));

    await expect(getWorkoutHistoryList(ownerId, request)).resolves.toMatchObject({ marker: "online" });
    expect(mocks.writeCache).toHaveBeenCalledOnce();
    finishWrite();
  });

  it("does not let a stale same-filter request overwrite the newer cached result", async () => {
    let resolveOlder!: (value: Response) => void;
    let resolveNewer!: (value: Response) => void;
    const older = new Promise<Response>((resolve) => { resolveOlder = resolve; });
    const newer = new Promise<Response>((resolve) => { resolveNewer = resolve; });
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(older)
      .mockReturnValueOnce(newer));
    mocks.writeCache.mockResolvedValue(undefined);

    const olderRead = getWorkoutHistoryList(ownerId, request);
    const newerRead = getWorkoutHistoryList(ownerId, request);
    resolveNewer(jsonResponse(response("newer")));
    await expect(newerRead).resolves.toMatchObject({ marker: "newer" });
    resolveOlder(jsonResponse(response("older")));
    await expect(olderRead).resolves.toMatchObject({ marker: "older" });

    expect(mocks.writeCache).toHaveBeenCalledOnce();
    expect(mocks.writeCache.mock.calls[0]?.[3]).toMatchObject({ marker: "newer" });
  });
});
