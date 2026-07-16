import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSourceMetadata, TrainingActivity } from "@/lib/activity-catalog/types";
import type { Workout } from "@/types";

const catalogClient = vi.hoisted(() => ({
  createCatalogRequestGroupId: vi.fn(() => "test-catalog-group"),
  getCatalogActivity: vi.fn(),
  getCatalogActivityAlternatives: vi.fn(),
  getCatalogFilters: vi.fn(),
  searchCatalogActivities: vi.fn()
}));

vi.mock("@/services/activity-catalog/client", () => catalogClient);
vi.mock("@/lib/supabase/client", () => ({ supabase: null }));

import {
  emptyCanonicalWorkoutFilterOptions,
  getCanonicalWorkoutFilterOptionsWithStatus,
  getWorkout,
  getWorkoutAlternatives,
  getWorkoutFilterOptionsWithStatus,
  getWorkoutsWithStatus,
  matchesWorkoutRecord,
  WORKOUT_LIBRARY_PAGE_SIZE
} from "./workout-library";

const meta: CatalogSourceMetadata = { source: "legacy", degraded: false, catalogVersion: "legacy" };

function activity(id: string, overrides: Partial<TrainingActivity> = {}): TrainingActivity {
  return {
    id,
    slug: `activity_${id}`,
    name: `Activity ${id}`,
    instructions: [],
    difficulty: "beginner",
    movementPattern: "Horizontal Push",
    forceType: "Push",
    version: 1,
    activityType: { id: `type-${id}`, slug: "strength", name: "Strength" },
    sports: [],
    sessionTypes: [],
    sessionPhases: [],
    equipment: [{ id: `equipment-${id}`, slug: "barbell", name: "Barbell", isRequired: true }],
    muscles: [
      { id: `primary-${id}`, slug: "pectoralis_major", name: "Pectoralis Major", bodyRegion: "Upper Body", role: "primary" },
      { id: `secondary-${id}`, slug: "triceps", name: "Triceps", bodyRegion: "Upper Body", role: "secondary" }
    ],
    trainingGoals: [],
    translations: {},
    updatedAt: null,
    ...overrides
  };
}

function searchResult(data: TrainingActivity[], offset = 0, nextOffset: number | null = null) {
  return {
    data,
    pagination: { limit: WORKOUT_LIBRARY_PAGE_SIZE, offset, returned: data.length, nextOffset },
    meta
  };
}

describe("workout library bounded pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses exactly one first-page request with offset zero and limit 60", async () => {
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult(
      Array.from({ length: 60 }, (_, index) => activity(String(index))),
      0,
      60
    ));

    const result = await getWorkoutsWithStatus("", {}, 0);

    expect(result.data).toHaveLength(60);
    expect(result.pagination).toEqual({ hasMore: true, nextOffset: 60 });
    expect(catalogClient.searchCatalogActivities).toHaveBeenCalledTimes(1);
    expect(catalogClient.searchCatalogActivities).toHaveBeenCalledWith(expect.objectContaining({
      limit: 60,
      offset: 0
    }), "test-catalog-group");
  });

  it("uses the exact provider cursor for one additional request and rejects offset regression", async () => {
    catalogClient.searchCatalogActivities
      .mockResolvedValueOnce(searchResult(Array.from({ length: 60 }, (_, index) => activity(String(index))), 0, 60))
      .mockResolvedValueOnce(searchResult([activity("tail")], 60, null))
      .mockResolvedValueOnce(searchResult([activity("regressed")], 120, 120));

    const first = await getWorkoutsWithStatus("", {}, 0);
    const second = await getWorkoutsWithStatus("", {}, first.pagination?.nextOffset ?? 0);
    const regressed = await getWorkoutsWithStatus("", {}, 120);

    expect(second.data.map((workout) => workout.id)).toEqual(["tail"]);
    expect(second.pagination).toEqual({ hasMore: false, nextOffset: null });
    expect(regressed.pagination).toEqual({ hasMore: false, nextOffset: null });
    expect(catalogClient.searchCatalogActivities).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 60, limit: 60 }), "test-catalog-group");
  });

  it("forwards every single-value picker compatibility filter before pagination", async () => {
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([activity("matching")], 0, null));

    const result = await getWorkoutsWithStatus("bench", {
      exerciseTypes: ["strength"],
      experienceLevels: ["beginner"],
      equipmentRequired: ["barbell"],
      primaryMuscles: ["pectoralis_major"],
      secondaryMuscles: ["triceps"],
      muscleCategories: ["upper_body"],
      mechanics: ["horizontal_push"],
      forceTypes: ["push"]
    });

    expect(result.data.map((workout) => workout.id)).toEqual(["matching"]);
    expect(catalogClient.searchCatalogActivities).toHaveBeenCalledWith(expect.objectContaining({
      query: "bench",
      activityType: "strength",
      difficulty: "beginner",
      equipment: ["barbell"],
      primaryMuscle: "pectoralis_major",
      secondaryMuscle: "triceps",
      muscleCategory: "upper_body",
      movementPattern: "horizontal_push",
      forceType: "push",
      limit: 60,
      offset: 0
    }), "test-catalog-group");
  });

  it("keeps unsupported multi-select combinations bounded by the final safety predicate", async () => {
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([
      activity("strength"),
      activity("cardio", { difficulty: "advanced", activityType: { id: "cardio", slug: "cardio", name: "Cardio" } }),
      activity("mobility", { difficulty: "intermediate", activityType: { id: "mobility", slug: "mobility", name: "Mobility" } })
    ]));

    const result = await getWorkoutsWithStatus("", {
      exerciseTypes: ["Strength", "Cardio"],
      experienceLevels: ["Beginner", "Advanced"]
    });

    expect(result.data.map((workout) => workout.id)).toEqual(["strength", "cardio"]);
    expect(catalogClient.searchCatalogActivities).toHaveBeenCalledWith(expect.not.objectContaining({
      activityType: expect.anything(),
      difficulty: expect.anything()
    }), "test-catalog-group");
  });

  it("loads complete canonical metadata including legacy compatibility dimensions", async () => {
    catalogClient.getCatalogFilters.mockResolvedValue({
      data: {
        sports: [], sessionTypes: [], sessionPhases: [], trainingGoals: [],
        activityTypes: [{ id: "strength", slug: "strength", name: "Strength" }],
        equipment: [{ id: "barbell", slug: "barbell", name: "Barbell" }],
        difficulties: ["beginner"],
        primaryMuscles: [{ id: "chest", slug: "pectoralis_major", name: "Pectoralis Major" }],
        secondaryMuscles: [{ id: "triceps", slug: "triceps", name: "Triceps" }],
        muscleCategories: [{ id: "upper", slug: "upper_body", name: "Upper Body" }],
        movementPatterns: [{ id: "push", slug: "horizontal_push", name: "Horizontal Push" }],
        forceTypes: [{ id: "force", slug: "push", name: "Push" }]
      },
      meta
    });

    const result = await getCanonicalWorkoutFilterOptionsWithStatus("en");

    expect(result.data).toMatchObject({
      exerciseTypes: [{ value: "strength", label: "Strength", aliases: [] }],
      equipmentRequired: [{ value: "barbell", label: "Barbell", aliases: [] }],
      experienceLevels: [{ value: "beginner", label: "beginner", aliases: [] }],
      primaryMuscles: [{ value: "pectoralis_major", label: "Pectoralis Major", aliases: [] }],
      secondaryMuscles: [{ value: "triceps", label: "Triceps", aliases: [] }],
      muscleCategories: [{ value: "upper_body", label: "Upper Body", aliases: [] }],
      mechanics: [{ value: "horizontal_push", label: "Horizontal Push", aliases: [] }],
      forceTypes: [{ value: "push", label: "Push", aliases: [] }]
    });
    expect(catalogClient.getCatalogFilters).toHaveBeenCalledTimes(1);
  });

  it("forwards locale and cancellation context through catalog calls", async () => {
    const controller = new AbortController();
    const context = { requestGroupId: "group-localized", signal: controller.signal };
    catalogClient.getCatalogFilters.mockResolvedValue({
      data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] },
      meta
    });
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([activity("localized")]));
    catalogClient.getCatalogActivity.mockResolvedValue({ data: activity("localized"), meta });
    catalogClient.getCatalogActivityAlternatives.mockResolvedValue({ data: [], meta });

    await getWorkoutFilterOptionsWithStatus("de-DE", context);
    await getWorkoutsWithStatus("druecken", {}, 0, "de-DE", context);
    await getWorkout("localized", "de-DE", context);
    await getWorkoutAlternatives("localized", 6, "de-DE", context);

    expect(catalogClient.getCatalogFilters).toHaveBeenCalledWith({ locale: "de-DE" }, context);
    expect(catalogClient.searchCatalogActivities).toHaveBeenCalledWith(expect.objectContaining({ locale: "de-DE" }), context);
    expect(catalogClient.getCatalogActivity).toHaveBeenCalledWith("localized", "de-DE", context);
    expect(catalogClient.getCatalogActivityAlternatives).toHaveBeenCalledWith("localized", { limit: 6, locale: "de-DE" }, context);
  });

  it("matches Arabic custom exercise queries and canonical selections across diacritics", () => {
    const custom: Workout = {
      id: "custom-arabic",
      name: "تَمْرِين الصَّدْر",
      category: "قوة",
      target_muscle: "الصَّدْر",
      equipment: "دُمبل",
      difficulty: "مبتدئ",
      sets: null,
      reps: null,
      rest_seconds: null,
      instructions: "",
      notes: null,
      is_global: false
    };
    const options = emptyCanonicalWorkoutFilterOptions();
    options.equipmentRequired = [{ value: "dumbbell", label: "دُمبل" }];
    options.primaryMuscles = [{ value: "chest", label: "الصَّدْر" }];

    expect(matchesWorkoutRecord(custom, "تمرين الصدر", {
      equipmentRequired: ["dumbbell"], primaryMuscles: ["chest"]
    }, options)).toBe(true);
    expect(matchesWorkoutRecord(custom, "تمرين الظهر", {}, options)).toBe(false);
  });

  it("locks the source contract to explicit pagination and active cancellation", () => {
    const library = readFileSync(resolve(process.cwd(), "services/database/workout-library.ts"), "utf8");
    const picker = readFileSync(resolve(process.cwd(), "components/workouts/exercise-picker-dialog.tsx"), "utf8");

    expect(library).toContain("WORKOUT_LIBRARY_PAGE_SIZE = 60");
    expect(library).not.toContain("maxCatalogRequestsPerPage");
    expect(library).not.toContain("catalogRequestPageSize");
    expect(picker).not.toContain("slice(0, 60)");
    expect(picker).toContain("AbortController");
    expect(picker).toContain("data-picker-load-more");
    expect(picker).toContain("pagination.nextOffset");
  });
});
