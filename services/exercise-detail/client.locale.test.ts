import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDomains: vi.fn(),
  getActivity: vi.fn(),
  getAlternatives: vi.fn(),
  getCustomExercises: vi.fn(),
  getUserVideo: vi.fn(),
  catalogModel: vi.fn(),
  customModel: vi.fn()
}));

vi.mock("@/services/activity-catalog/client", () => ({
  listLibraryDomains: mocks.listDomains,
  getLibraryDomainActivity: mocks.getActivity,
  getLibraryDomainActivityAlternatives: mocks.getAlternatives
}));

vi.mock("@/services/workouts/exercise-library-store", () => ({
  getCustomExercisesWithStatus: mocks.getCustomExercises
}));

vi.mock("@/services/database/workout-library", () => ({
  getUserExerciseVideo: mocks.getUserVideo
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

const catalogCore = { identity: { source: "catalog", activityId: "activity-1" } };
const customCore = { identity: { source: "custom", activityId: "custom-1" } };
const activity = { id: "activity-1", revisionId: "revision-1" };
const providerMeta = { source: "library_v2", degraded: false };

describe("Exercise Detail locale contracts", () => {
  beforeEach(() => {
    mocks.listDomains.mockReset().mockResolvedValue({ data: [{ key: "strength" }], meta: providerMeta });
    mocks.getActivity.mockReset().mockResolvedValue({ data: activity, meta: providerMeta });
    mocks.getAlternatives.mockReset().mockResolvedValue({ data: [], meta: providerMeta });
    mocks.getCustomExercises.mockReset().mockResolvedValue({ data: [] });
    mocks.getUserVideo.mockReset().mockResolvedValue(null);
    mocks.catalogModel.mockReset().mockReturnValue(catalogCore);
    mocks.customModel.mockReset().mockReturnValue(customCore);
  });

  it.each([
    ["en-US", "en"],
    ["de-DE", "de"],
    ["ar", "ar"]
  ] as const)("uses Catalog locale %s-independent mapping %s for domain, detail, and alternatives", async (intlLocale, catalogLocale) => {
    const resolved = await resolveExerciseDetail("activity-1", undefined, intlLocale, catalogLocale);

    expect(mocks.listDomains).toHaveBeenCalledWith(catalogLocale);
    expect(mocks.getActivity).toHaveBeenCalledWith("strength", "activity-1", catalogLocale);
    expect(mocks.catalogModel).toHaveBeenCalledWith(activity, providerMeta, "strength");

    await loadExerciseAlternatives(resolved, catalogLocale);
    expect(mocks.getAlternatives).toHaveBeenCalledWith("strength", "activity-1", { limit: 10, locale: catalogLocale });
  });

  it("preserves Intl locale for custom Exercise Detail formatting without calling Library routes", async () => {
    const custom = { id: "custom-1", custom_video_url: null };
    mocks.getCustomExercises.mockResolvedValue({ data: [custom] });

    await resolveExerciseDetail("custom-1", undefined, "de-DE", "de");

    expect(mocks.customModel).toHaveBeenCalledWith(custom, "de-DE");
    expect(mocks.listDomains).not.toHaveBeenCalled();
    expect(mocks.getActivity).not.toHaveBeenCalled();
  });
});
