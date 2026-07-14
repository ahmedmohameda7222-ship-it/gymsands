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
  name: "External Bench Press",
  shortDescription: "A catalog exercise.",
  instructions: [{ order: 1, text: "Press with control." }],
  difficulty: "beginner",
  movementPattern: "horizontal_push",
  version: 3,
  activityType: { id: "11111111-1111-4111-8111-111111111111", slug: "strength_exercise", name: "Strength Exercise" },
  metricSchema: {
    slug: "strength_repetitions",
    name: "Strength repetitions",
    fields: [{ key: "reps", label: "Repetitions", type: "integer", unit: "rep", required: false }]
  },
  sports: [],
  sessionTypes: [],
  sessionPhases: [],
  equipment: [
    { id: "22222222-2222-4222-8222-222222222222", slug: "barbell", name: "Barbell", isRequired: true },
    { id: "33333333-3333-4333-8333-333333333333", slug: "bench", name: "Bench", isRequired: false }
  ],
  muscles: [
    { id: "44444444-4444-4444-8444-444444444444", slug: "pectoralis_major", name: "Pectoralis Major", bodyRegion: "Upper body", role: "primary" },
    { id: "55555555-5555-4555-8555-555555555555", slug: "triceps", name: "Triceps", bodyRegion: "Upper body", role: "secondary" },
    { id: "66666666-6666-4666-8666-666666666666", slug: "serratus_anterior", name: "Serratus Anterior", bodyRegion: "Upper body", role: "stabilizer" }
  ],
  trainingGoals: [{ id: "77777777-7777-4777-8777-777777777777", slug: "strength", name: "Strength", relevanceWeight: 0.9 }],
  translations: {
    de: { name: "Langhantel-Bankdrücken" },
    ar: { name: "ضغط صدر بالبار" }
  },
  publishedAt: null,
  updatedAt: "2026-07-10T08:00:00.000Z"
};

function externalResult<T>(data: T): ActivityCatalogResult<T> {
  return { data, meta: { source: "external", degraded: false, apiVersion: "v1", locale: "en" } };
}

function fixtureUuid(index: number) {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function fixtureActivity(index: number): TrainingActivity {
  const dumbbell = index % 2 === 1;
  const beginner = index % 3 === 0;
  return {
    ...activity,
    id: fixtureUuid(index + 1),
    slug: `compatibility_activity_${String(index + 1).padStart(3, "0")}`,
    name: `Compatibility Activity ${String(index + 1).padStart(3, "0")}`,
    difficulty: beginner ? "beginner" : "intermediate",
    equipment: [{
      id: dumbbell ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "22222222-2222-4222-8222-222222222222",
      slug: dumbbell ? "dumbbell" : "barbell",
      name: dumbbell ? "Dumbbell" : "Barbell",
      isRequired: true
    }]
  };
}

function mockDataset(dataset: TrainingActivity[]) {
  mocks.search.mockImplementation(async (params: { offset?: number; limit?: number }) => {
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    const data = dataset.slice(offset, offset + limit);
    return {
      ...externalResult(data),
      pagination: {
        limit,
        offset,
        returned: data.length,
        nextOffset: offset + data.length < dataset.length ? offset + data.length : null
      }
    };
  });
}

beforeEach(() => vi.clearAllMocks());

describe("workout library provider compatibility", () => {
  it("resolves an external slug and keeps the canonical English activity name", async () => {
    mocks.getActivity.mockResolvedValueOnce(externalResult(activity));
    await expect(getWorkout(activity.slug)).resolves.toMatchObject({
      id: activity.id,
      name: activity.name,
      activity_catalog: { source: "external", activityId: activity.id, slug: activity.slug, version: 3 }
    });
    expect(mocks.getActivity).toHaveBeenCalledWith(activity.slug, { locale: "en", signal: undefined });

    const notFound = Object.assign(new Error("not found"), { code: "not_found" });
    mocks.getActivity.mockRejectedValueOnce(notFound);
    await expect(getWorkout("missing_legacy_id")).rejects.toBe(notFound);
  });

  it("keeps a successful empty external search empty with explicit pagination", async () => {
    mocks.search.mockResolvedValueOnce({
      ...externalResult([]),
      pagination: { limit: 100, offset: 0, returned: 0, nextOffset: null }
    });
    await expect(getWorkoutsWithStatus()).resolves.toEqual({
      data: [],
      status: { source: "live", catalogSource: "external", degraded: false },
      pagination: { page: 0, pageSize: 100, hasMore: false, bounded: false }
    });
  });

  it("uses ordinary external offsets for a directly representable single-value filter", async () => {
    mocks.search.mockResolvedValueOnce({
      ...externalResult([activity]),
      pagination: { limit: 100, offset: 200, returned: 1, nextOffset: 300 }
    });

    const result = await getWorkoutsWithStatus("", { equipmentRequired: ["Barbell"] }, 2);
    expect(result.pagination).toEqual({ page: 2, pageSize: 100, hasMore: true, bounded: false });
    expect(mocks.search).toHaveBeenCalledOnce();
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({
      equipment: ["barbell"],
      limit: 100,
      offset: 200,
      locale: "en"
    }));
  });

  it("returns stable logical pages from a bounded multi-select compatibility scan", async () => {
    const dataset = Array.from({ length: 250 }, (_value, index) => fixtureActivity(index));
    const filters = {
      equipmentRequired: ["Barbell", "Dumbbell"],
      experienceLevels: ["Beginner", "Intermediate"],
      exerciseTypes: ["Strength Exercise", "Mobility Exercise"]
    };
    mockDataset(dataset);

    const first = await getWorkoutsWithStatus("", filters, 0);
    mocks.search.mockClear();
    const second = await getWorkoutsWithStatus("", filters, 1);
    mocks.search.mockClear();
    const third = await getWorkoutsWithStatus("", filters, 2);

    expect(first.data.map((item) => item.id)).toEqual(dataset.slice(0, 100).map((item) => item.id));
    expect(second.data.map((item) => item.id)).toEqual(dataset.slice(100, 200).map((item) => item.id));
    expect(third.data.map((item) => item.id)).toEqual(dataset.slice(200).map((item) => item.id));
    const combinedIds = [...first.data, ...second.data, ...third.data].map((item) => item.id);
    expect(combinedIds).toEqual(dataset.map((item) => item.id));
    expect(new Set(combinedIds).size).toBe(combinedIds.length);
    expect(first.pagination).toEqual({ page: 0, pageSize: 100, hasMore: true, bounded: false });
    expect(second.pagination).toEqual({ page: 1, pageSize: 100, hasMore: true, bounded: false });
    expect(third.pagination).toEqual({ page: 2, pageSize: 100, hasMore: false, bounded: false });
    expect(mocks.search).toHaveBeenCalledTimes(3);
    expect(mocks.search.mock.calls.map(([params]) => params.offset)).toEqual([0, 100, 200]);
    expect(mocks.search.mock.calls.every(([params]) => !params.equipment && !params.difficulty && !params.activityType)).toBe(true);
  });

  it("reports an explicit bounded state without exceeding three upstream pages", async () => {
    mockDataset(Array.from({ length: 400 }, (_value, index) => fixtureActivity(index)));
    const result = await getWorkoutsWithStatus("", { equipmentRequired: ["Barbell", "Dumbbell"] }, 2);

    expect(result.data).toHaveLength(100);
    expect(result.pagination).toEqual({ page: 2, pageSize: 100, hasMore: false, bounded: true });
    expect(result.status).toMatchObject({ source: "partial" });
    expect(result.status.message).toMatch(/bounded compatibility scan/i);
    expect(mocks.search).toHaveBeenCalledTimes(3);
  });

  it("reports partial alternatives when summaries resolve but detail does not", async () => {
    mocks.getAlternatives.mockResolvedValueOnce(externalResult([{
      sourceActivityId: activity.id,
      alternativeActivityId: "99999999-9999-4999-8999-999999999999",
      alternativeSlug: "incline_bench_press",
      alternativeName: "Incline Bench Press",
      alternativeActivityTypeSlug: "strength_exercise",
      alternativeDifficulty: "intermediate",
      reasonCode: "same_pattern",
      differenceSummary: "Changes the pressing angle.",
      prescriptionTransfer: "partial",
      compatibilityScore: 0.9,
      priority: 1
    }]));
    mocks.getActivity.mockRejectedValueOnce(new Error("temporary detail failure"));

    await expect(getWorkoutAlternatives(activity.id)).resolves.toEqual({
      data: [],
      status: expect.objectContaining({ source: "partial", message: "Alternative exercise details could not load." })
    });
    expect(mocks.getAlternatives).toHaveBeenCalledWith(activity.id, expect.objectContaining({ locale: "en" }));
  });
});
