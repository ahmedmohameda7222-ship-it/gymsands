import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityCatalogResult, TrainingActivity } from "@/lib/activity-catalog/types";

const mocks = vi.hoisted(() => ({
  getActivity: vi.fn(),
  getAlternatives: vi.fn(),
  getFilters: vi.fn(),
  search: vi.fn()
}));

vi.mock("@/services/activity-catalog/client", () => ({
  getActivityCatalogActivity: mocks.getActivity,
  getActivityCatalogAlternatives: mocks.getAlternatives,
  getActivityCatalogFilters: mocks.getFilters,
  searchActivityCatalog: mocks.search
}));

import { getWorkout, getWorkoutAlternatives, getWorkoutsWithStatus } from "@/services/database/workout-library";

const activity: TrainingActivity = {
  id: "88888888-8888-4888-8888-888888888888",
  slug: "external_bench_press",
  name: "External bench press",
  shortDescription: "A catalog exercise.",
  instructions: [{ order: 1, text: "Press with control." }],
  difficulty: "beginner",
  movementPattern: "horizontal_push",
  version: 3,
  activityType: { id: "11111111-1111-4111-8111-111111111111", slug: "strength", name: "Strength" },
  metricSchema: null,
  sports: [],
  sessionTypes: [],
  sessionPhases: [],
  equipment: [{ id: "22222222-2222-4222-8222-222222222222", slug: "barbell", name: "Barbell", isRequired: true }],
  muscles: [{ id: "33333333-3333-4333-8333-333333333333", slug: "chest", name: "Chest", bodyRegion: "Upper body", role: "primary" }],
  trainingGoals: [],
  translations: {},
  publishedAt: null,
  updatedAt: "2026-07-02T00:00:00.000Z"
};

function externalResult<T>(data: T): ActivityCatalogResult<T> {
  return { data, meta: { source: "external", degraded: false, apiVersion: "v1", locale: "en" } };
}

beforeEach(() => vi.clearAllMocks());

describe("workout library provider compatibility", () => {
  it("resolves an external slug without substituting an unrelated legacy item", async () => {
    mocks.getActivity.mockResolvedValueOnce(externalResult(activity));
    await expect(getWorkout(activity.slug)).resolves.toMatchObject({
      id: activity.id,
      name: activity.name,
      activity_catalog: { source: "external", activityId: activity.id, slug: activity.slug, version: 3 }
    });
    expect(mocks.getActivity).toHaveBeenCalledWith(activity.slug, { signal: undefined });

    const notFound = Object.assign(new Error("not found"), { code: "not_found" });
    mocks.getActivity.mockRejectedValueOnce(notFound);
    await expect(getWorkout("missing_legacy_id")).rejects.toBe(notFound);
  });

  it("keeps a successful empty external search empty", async () => {
    mocks.search.mockResolvedValueOnce({
      ...externalResult([]),
      pagination: { limit: 100, offset: 0, returned: 0, nextOffset: null }
    });
    await expect(getWorkoutsWithStatus()).resolves.toEqual({
      data: [],
      status: { source: "live", catalogSource: "external", degraded: false }
    });
  });

  it("reports partial alternatives when summaries resolve but detail does not", async () => {
    mocks.getAlternatives.mockResolvedValueOnce(externalResult([{
      activityId: activity.id,
      alternativeActivityId: "99999999-9999-4999-8999-999999999999",
      slug: "incline_bench_press",
      name: "Incline bench press",
      reason: "Same movement",
      score: 0.9
    }]));
    mocks.getActivity.mockRejectedValueOnce(new Error("temporary detail failure"));

    await expect(getWorkoutAlternatives(activity.id)).resolves.toEqual({
      data: [],
      status: expect.objectContaining({ source: "partial", message: "Alternative exercise details could not load." })
    });
  });
});
