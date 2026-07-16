import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn()
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } }
}));
vi.mock("@/lib/env", () => ({ env: { useMockAuth: false } }));

import { CATALOG_REQUEST_GROUP_ID_HEADER, isValidOperationalCorrelationId } from "@/lib/observability/correlation-id";
import { getCatalogFilters, searchCatalogActivities } from "./client";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Activity Catalog client request-group propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "member-token" } } });
    vi.stubGlobal("fetch", vi.fn(async (path: string) => path.includes("filters")
      ? jsonResponse({
          data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] },
          meta: { source: "external", degraded: false, catalogVersion: "v1" }
        })
      : jsonResponse({
          data: [],
          pagination: { limit: 30, offset: 0, returned: 0, nextOffset: null },
          meta: { source: "external", degraded: false, catalogVersion: "v1" }
        })));
  });

  it("reuses one valid group ID across related filters and activities calls", async () => {
    const groupId = "exercise-picker-load-1";
    await Promise.all([
      getCatalogFilters({ locale: "en" }, groupId),
      searchCatalogActivities({ query: "squat", limit: 30, offset: 0 }, groupId)
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect((init?.headers as Record<string, string>)[CATALOG_REQUEST_GROUP_ID_HEADER]).toBe(groupId);
    }
  });

  it("replaces invalid group IDs without putting user data in the generated ID", async () => {
    await searchCatalogActivities({ limit: 30, offset: 0 }, "member@example.com group");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const selected = (init?.headers as Record<string, string>)[CATALOG_REQUEST_GROUP_ID_HEADER];
    expect(isValidOperationalCorrelationId(selected)).toBe(true);
    expect(selected).not.toContain("member@example.com");
  });
});
