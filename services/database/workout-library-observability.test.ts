import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGroup: vi.fn(),
  getFilters: vi.fn(),
  searchActivities: vi.fn()
}));

vi.mock("@/services/activity-catalog/client", () => ({
  createCatalogRequestGroupId: mocks.createGroup,
  getCatalogActivity: vi.fn(),
  getCatalogActivityAlternatives: vi.fn(),
  getCatalogFilters: mocks.getFilters,
  searchCatalogActivities: mocks.searchActivities
}));
vi.mock("@/lib/activity-catalog/adapter", () => ({
  activityToWorkout: vi.fn(),
  alternativeToWorkout: vi.fn()
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: null }));

import { getCanonicalWorkoutFilterOptionsWithStatus, getWorkoutsWithStatus } from "./workout-library";

const meta = { source: "external" as const, degraded: false, catalogVersion: "v1" };

function searchPage(offset: number, nextOffset: number | null) {
  return {
    data: [],
    pagination: { limit: 100, offset, returned: 0, nextOffset },
    meta
  };
}

describe("Exercise Library catalog request grouping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGroup.mockReturnValue("generated-library-load-1");
    mocks.getFilters.mockResolvedValue({
      data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] },
      meta
    });
  });

  it("reuses one generated group ID across the existing sequential pagination loop", async () => {
    mocks.searchActivities
      .mockResolvedValueOnce(searchPage(0, 100))
      .mockResolvedValueOnce(searchPage(100, null));

    await getWorkoutsWithStatus("", {}, 0, "en");

    expect(mocks.createGroup).toHaveBeenCalledOnce();
    expect(mocks.searchActivities).toHaveBeenCalledTimes(2);
    expect(mocks.searchActivities.mock.calls[0][1]).toBe("generated-library-load-1");
    expect(mocks.searchActivities.mock.calls[1][1]).toBe("generated-library-load-1");
    expect(mocks.searchActivities.mock.calls.map((call) => call[0].offset)).toEqual([0, 100]);
  });

  it("propagates one explicit logical-load group across related filters and activities calls", async () => {
    mocks.searchActivities.mockResolvedValueOnce(searchPage(0, null));

    await getCanonicalWorkoutFilterOptionsWithStatus("en", "exercise-picker-load-1");
    await getWorkoutsWithStatus("", {}, 0, "en", "exercise-picker-load-1");

    expect(mocks.getFilters).toHaveBeenCalledWith({ locale: "en" }, "exercise-picker-load-1");
    expect(mocks.searchActivities).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, offset: 0, locale: "en" }),
      "exercise-picker-load-1"
    );
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });
});
