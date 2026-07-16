import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGroup: vi.fn(() => "pagination-edge-group"),
  searchActivities: vi.fn()
}));

vi.mock("@/services/activity-catalog/client", () => ({
  createCatalogRequestGroupId: mocks.createGroup,
  getCatalogActivity: vi.fn(),
  getCatalogActivityAlternatives: vi.fn(),
  getCatalogFilters: vi.fn(),
  searchCatalogActivities: mocks.searchActivities
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: null }));

import { getWorkoutsWithStatus } from "./workout-library";

describe("workout library pagination termination", () => {
  it("treats an empty provider page as final even if the provider advertises a later cursor", async () => {
    mocks.searchActivities.mockResolvedValue({
      data: [],
      pagination: { limit: 60, offset: 60, returned: 0, nextOffset: 120 },
      meta: { source: "legacy", degraded: false, catalogVersion: "legacy" }
    });

    const result = await getWorkoutsWithStatus("", {}, 60);

    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({ hasMore: false, nextOffset: null });
    expect(mocks.searchActivities).toHaveBeenCalledTimes(1);
  });
});
