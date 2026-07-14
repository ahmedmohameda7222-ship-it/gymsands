import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  useMockAuth: false
}));

vi.mock("@/lib/env", () => ({ env: { useMockAuth: mocks.useMockAuth } }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } }
}));

import {
  ActivityCatalogClientError,
  getActivityCatalogActivity,
  searchActivityCatalog
} from "@/services/activity-catalog/client";

const result = {
  data: [],
  pagination: { limit: 30, offset: 0, returned: 0, nextOffset: null },
  meta: { source: "external", degraded: false, apiVersion: "v1", locale: "en", requestId: "request-test" }
};

describe("activity catalog browser client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "plaivra-member-test-token" } },
      error: null
    });
  });

  it("calls only the same-origin Plaivra route with allowlisted request data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    await searchActivityCatalog({
      query: "squat",
      equipment: ["barbell", "rack"],
      difficulty: "intermediate",
      limit: 100,
      offset: 0,
      locale: "en"
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^\/api\/activity-catalog\/activities\?/);
    expect(String(url)).not.toContain("plaivra-activity-catalog-api.vercel.app");
    expect(String(url)).not.toContain("userId");
    expect(String(url)).not.toContain("profile");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer plaivra-member-test-token"
    });
  });

  it("encodes identifiers and forwards cancellation without accepting arbitrary URLs", async () => {
    const activityResult = {
      ...result,
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "front_squat"
      }
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(activityResult), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const controller = new AbortController();
    await getActivityCatalogActivity("front_squat", { signal: controller.signal });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/activity-catalog/activities/front_squat");
    expect(init?.signal).toBe(controller.signal);
  });

  it("maps authentication expiry safely and never returns internal or secret text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        error: { code: "upstream_unauthorized", message: "Bearer catalog-secret-value" }
      }), { status: 401, headers: { "Content-Type": "application/json" } })
    );

    const error = await searchActivityCatalog().catch((caught) => caught as ActivityCatalogClientError);
    expect(error).toMatchObject({
      name: "ActivityCatalogClientError",
      code: "upstream_unauthorized",
      status: 401,
      message: "Your session expired. Please sign in again."
    });
    expect(String(error)).not.toContain("catalog-secret-value");
  });

  it("rejects malformed successful internal responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    await expect(searchActivityCatalog()).rejects.toEqual(
      expect.objectContaining({ code: "invalid_response", status: 502 })
    );
  });
});
