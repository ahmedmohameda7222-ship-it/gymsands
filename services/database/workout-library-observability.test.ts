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

describe("Exercise Library catalog request grouping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGroup.mockReturnValue("generated-library-load-1");
    mocks.getFilters.mockResolvedValue({
      data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] },
      meta
    });
    mocks.searchActivities
      .mockResolvedValueOnce({
        data: [],
        pagination: { limit: 100, offset: 0, returned: 0, nextOffset: 100 },
        meta
      })
      .mockResolvedValueOnce({
        data: [],
        pagination: { limit: 100, offset: 100, returned: 0, nextOffset: null },
        meta
      });
  });

  it("reuses one generated group ID across the existing sequential pagination loop", async () => {
    await getWorkoutsWithStatus("", {}, 0, "en");

    expect(mocks.createGroup).toHaveBeenCalledOnce();
    expect(mocks.searchActivities).toHaveBeenCalledTimes(2);
    expect(mocks.searchActivities.mock.calls[0][1]).toBe("generated-library-load-1");
    expect(mocks.searchActivities.mock.calls[1][1]).toBe("generated-library-load-1");
    expect(mocks.searchActivities.mock.calls.map(([params]) => params.offset)).toEqual([0, 100]);
  });

  it("passes an explicit logical-load group ID to the filters request", async () => {
    await getCanonicalWorkoutFilterOptionsWithStatus("en", "exercise-picker-load-1");
    expect(mocks.getFilters).toHaveBeenCalledWith({ locale: "en" }, "exercise-picker-load-1");
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });
});
