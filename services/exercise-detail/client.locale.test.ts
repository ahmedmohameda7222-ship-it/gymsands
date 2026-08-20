import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivity: vi.fn(),
  getAlternatives: vi.fn(),
  getCustomExercise: vi.fn(),
  catalogModel: vi.fn(),
  customModel: vi.fn()
}));

vi.mock("@/services/activity-catalog/client", () => ({
  getLibraryActivity: mocks.getActivity,
  getLibraryDomainActivityAlternatives: mocks.getAlternatives
}));

vi.mock("@/services/exercise-detail/custom-exercise", () => ({
  getOwnedCustomExerciseDirect: mocks.getCustomExercise
}));

vi.mock("@/services/database/workout-plans", () => ({
  getUserWorkoutPlans: vi.fn()
}));

vi.mock("@/lib/exercise-detail/model", () => ({
  catalogActivityDetailModel: mocks.catalogModel,
  customExerciseDetailModel: mocks.customModel
}));

vi.mock("@/lib/supabase/client", () => ({ supabase: null }));

import { loadExerciseAlternatives, resolveExerciseDetail } from "./client";

const catalogCore = { identity: { source: "catalog_v2", activityId: "activity-1" } };
const customCore = { identity: { source: "custom", activityId: "custom-1" } };
const activity = { id: "activity-1", revisionId: "revision-1", domain: "strength" };
const providerMeta = { source: "library_v2", degraded: false };

describe("Exercise Detail locale contracts", () => {
  beforeEach(() => {
    mocks.getActivity.mockReset().mockResolvedValue({ data: activity, meta: providerMeta });
    mocks.getAlternatives.mockReset().mockResolvedValue({ data: [], meta: providerMeta });
    mocks.getCustomExercise.mockReset().mockResolvedValue(null);
    mocks.catalogModel.mockReset().mockReturnValue(catalogCore);
    mocks.customModel.mockReset().mockReturnValue(customCore);
  });

  it.each([
    ["en-US", "en"],
    ["de-DE", "de"],
    ["ar", "ar"]
  ] as const)("keeps Intl locale %s separate from Catalog locale %s for one-call detail and alternatives", async (intlLocale, catalogLocale) => {
    const resolved = await resolveExerciseDetail("activity-1", undefined, intlLocale, catalogLocale);

    expect(mocks.getCustomExercise).toHaveBeenCalledWith(undefined, "activity-1", undefined);
    expect(mocks.getActivity).toHaveBeenCalledWith("activity-1", catalogLocale, { signal: undefined });
    expect(mocks.catalogModel).toHaveBeenCalledWith(activity, providerMeta, "strength");

    await loadExerciseAlternatives(resolved, catalogLocale);
    expect(mocks.getAlternatives).toHaveBeenCalledWith(
      "strength",
      "activity-1",
      { limit: 10, locale: catalogLocale },
      { signal: undefined }
    );
  });

  it("preserves Intl locale for custom Exercise Detail formatting without calling Library routes", async () => {
    const custom = { id: "custom-1" };
    mocks.getCustomExercise.mockResolvedValue(custom);

    await resolveExerciseDetail("custom-1", "user-1", "de-DE", "de");

    expect(mocks.getCustomExercise).toHaveBeenCalledWith("user-1", "custom-1", undefined);
    expect(mocks.customModel).toHaveBeenCalledWith(custom, "de-DE");
    expect(mocks.getActivity).not.toHaveBeenCalled();
  });
});