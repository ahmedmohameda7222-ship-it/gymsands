import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTodayProjectionFixture } from "@/lib/dashboard/testing/today-projection-fixture";

const mocks = vi.hoisted(() => ({
  env: { useMockAuth: false },
  mockUser: false,
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/fixtures/mock-auth", () => ({
  isMockAuthUserId: () => mocks.mockUser,
}));

import {
  getTodayProjection,
  TodayProjectionClientError,
} from "@/services/dashboard/today-client";

const ownerId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.env.useMockAuth = false;
  mocks.mockUser = false;
  vi.restoreAllMocks();
});

describe("Today authenticated browser client", () => {
  it("uses the explicit token only in Authorization and forwards request controls", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(createTodayProjectionFixture()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      getTodayProjection(ownerId, "2026-08-03", "Europe/Berlin", {
        accessToken: "today-token-secret",
        signal,
      }),
    ).resolves.toMatchObject({ contractVersion: 1 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "/api/dashboard/today?date=2026-08-03&timezone=Europe%2FBerlin",
    );
    expect(String(url)).not.toContain(ownerId);
    expect(String(url)).not.toContain("today-token-secret");
    expect(options).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: { Authorization: "Bearer today-token-secret" },
    });
  });

  it("starts no request when the token is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      getTodayProjection(ownerId, "2026-08-03", "Europe/Berlin", {
        accessToken: null,
      }),
    ).rejects.toMatchObject({ code: "sign_in_required", status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes server and invalid-contract errors without leaking payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "relation private_table missing token=secret",
          code: "internal_database_error",
        }),
        { status: 503 },
      ),
    );
    await expect(
      getTodayProjection(ownerId, "2026-08-03", "Europe/Berlin", {
        accessToken: "secret",
      }),
    ).rejects.toEqual(
      new TodayProjectionClientError(
        "today_projection_unavailable",
        "Today could not load.",
        503,
      ),
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ contractVersion: 1 }), { status: 200 }),
    );
    await expect(
      getTodayProjection(ownerId, "2026-08-03", "Europe/Berlin", {
        accessToken: "secret",
      }),
    ).rejects.toMatchObject({
      code: "today_projection_invalid",
      message: "Today could not load.",
    });
  });

  it("rejects a valid contract for another date or timezone", async () => {
    const mismatched = createTodayProjectionFixture({
      date: "2026-08-04",
      timezone: "Europe/London",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mismatched), { status: 200 }),
    );

    await expect(
      getTodayProjection(ownerId, "2026-08-03", "Europe/Berlin", {
        accessToken: "secret",
      }),
    ).rejects.toMatchObject({
      code: "today_projection_invalid",
      message: "Today could not load.",
    });
  });

  it("keeps deterministic mock auth off the network", async () => {
    mocks.env.useMockAuth = true;
    mocks.mockUser = true;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await getTodayProjection(
      ownerId,
      "2026-08-03",
      "Europe/Berlin",
      { accessToken: null },
    );
    expect(result.contractVersion).toBe(1);
    expect(result.date).toBe("2026-08-03");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
