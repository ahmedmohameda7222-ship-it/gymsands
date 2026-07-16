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
  mergeWorkoutFilterOptions,
  type WorkoutFilterOptions
} from "./workout-library";

const meta: CatalogSourceMetadata = { source: "external", degraded: false, catalogVersion: "v1" };
const noOptions: WorkoutFilterOptions = {
  muscleCategories: [], primaryMuscles: [], equipmentRequired: [], mechanics: [],
  exerciseTypes: [], forceTypes: [], experienceLevels: [], secondaryMuscles: []
};

function activity(
  id: string,
  overrides: Partial<TrainingActivity> = {}
): TrainingActivity {
  return {
    id,
    slug: `activity-${id}`,
    name: `Activity ${id}`,
    instructions: [],
    difficulty: "beginner",
    movementPattern: "Horizontal Push",
    version: 1,
    activityType: { id: `type-${id}`, slug: "strength", name: "Strength" },
    sports: [],
    sessionTypes: [],
    sessionPhases: [],
    equipment: [{ id: `equipment-${id}`, slug: "barbell", name: "Barbell", isRequired: true }],
    muscles: [
      { id: `primary-${id}`, slug: "pectoralis-major", name: "Pectoralis Major", bodyRegion: "Upper Body", role: "primary" },
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
    pagination: { limit: 100, offset, returned: data.length, nextOffset },
    meta
  };
}

describe("workout library compatibility filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps multi-select activity types and difficulties client-side and returns only either selected value", async () => {
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([
      activity("strength", { difficulty: "beginner" }),
      activity("cardio", {
        difficulty: "advanced",
        activityType: { id: "cardio", slug: "cardio", name: "Cardio" }
      }),
      activity("mobility", {
        difficulty: "intermediate",
        activityType: { id: "mobility", slug: "mobility", name: "Mobility" }
      })
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

  it("applies equipment, movement, primary-muscle, and secondary-muscle selections without broadening", async () => {
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([
      activity("matching"),
      activity("wrong-movement", { movementPattern: "Vertical Pull" }),
      activity("wrong-muscle", {
        muscles: [{ id: "back", slug: "latissimus-dorsi", name: "Latissimus Dorsi", bodyRegion: "Upper Body", role: "primary" }]
      }),
      activity("wrong-equipment", {
        equipment: [{ id: "machine", slug: "machine", name: "Machine", isRequired: true }]
      })
    ]));

    const result = await getWorkoutsWithStatus("", {
      equipmentRequired: ["Barbell", "Resistance Band"],
      mechanics: ["Horizontal Push"],
      muscleCategories: ["Upper Body"],
      primaryMuscles: ["Pectoralis Major"],
      secondaryMuscles: ["Triceps"]
    });

    expect(result.data.map((workout) => workout.id)).toEqual(["matching"]);
    expect(catalogClient.searchCatalogActivities).toHaveBeenCalledWith(expect.not.objectContaining({
      equipment: expect.anything()
    }), "test-catalog-group");
  });

  it("keeps body-region muscle categories distinct from primary muscle names and slugs", async () => {
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([
      activity("upper-body"),
      activity("lower-body", {
        muscles: [{ id: "quad", slug: "quadriceps", name: "Quadriceps", bodyRegion: "Lower Body", role: "primary" }]
      })
    ]));

    const byRegion = await getWorkoutsWithStatus("", { muscleCategories: ["Upper Body"] });
    expect(byRegion.data.map((workout) => workout.id)).toEqual(["upper-body"]);
    expect(byRegion.data[0]?.muscle_category).toBe("Upper Body");
    expect(mergeWorkoutFilterOptions(noOptions, byRegion.data)).toMatchObject({
      muscleCategories: ["Upper Body"],
      primaryMuscles: ["Pectoralis Major"],
      mechanics: ["Horizontal Push"]
    });

    const byPrimarySlug = await getWorkoutsWithStatus("", { primaryMuscles: ["pectoralis-major"] });
    expect(byPrimarySlug.data.map((workout) => workout.id)).toEqual(["upper-body"]);

    const categoryMustNotMatchMuscleName = await getWorkoutsWithStatus("", { muscleCategories: ["Pectoralis Major"] });
    expect(categoryMustNotMatchMuscleName.data).toEqual([]);
  });

  it("does not render unsupported filter groups with no available or selected values", () => {
    const browser = readFileSync(resolve(process.cwd(), "components/workouts/workout-browser.tsx"), "utf8");
    expect(browser).toContain("if (!availableValues.length) return null;");
    expect(browser).not.toContain("No options yet.");
  });

  it("forwards the selected catalog locale through filter, search, detail, and alternatives calls", async () => {
    catalogClient.getCatalogFilters.mockResolvedValue({
      data: {
        sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [],
        equipment: [], trainingGoals: [], difficulties: []
      },
      meta
    });
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([activity("localized")]));
    catalogClient.getCatalogActivity.mockResolvedValue({ data: activity("localized"), meta });
    catalogClient.getCatalogActivityAlternatives.mockResolvedValue({ data: [], meta });

    await getWorkoutFilterOptionsWithStatus("de-DE");
    await getWorkoutsWithStatus("druecken", {}, 0, "de-DE");
    await getWorkout("localized", "de-DE");
    await getWorkoutAlternatives("localized", 6, "de-DE");

    expect(catalogClient.getCatalogFilters).toHaveBeenCalledWith({ locale: "de-DE" }, undefined);
    expect(catalogClient.searchCatalogActivities).toHaveBeenCalledWith(expect.objectContaining({ locale: "de-DE" }), "test-catalog-group");
    expect(catalogClient.getCatalogActivity).toHaveBeenCalledWith("localized", "de-DE", undefined);
    expect(catalogClient.getCatalogActivityAlternatives).toHaveBeenCalledWith("localized", { limit: 6, locale: "de-DE" }, undefined);
  });

  it("keeps localized taxonomy labels separate from canonical API slug values", async () => {
    catalogClient.getCatalogFilters.mockResolvedValue({
      data: {
        sports: [], sessionTypes: [], sessionPhases: [], trainingGoals: [],
        activityTypes: [{ id: "strength-id", slug: "strength", name: "قوة" }],
        equipment: [{ id: "dumbbell-id", slug: "dumbbell", name: "دُمبل" }],
        difficulties: ["beginner"]
      },
      meta
    });
    const localizedActivity = activity("arabic", {
      name: "تَمْرِين الصَّدْر",
      activityType: { id: "strength-id", slug: "strength", name: "قوة" },
      equipment: [{ id: "dumbbell-id", slug: "dumbbell", name: "دُمبل", isRequired: true }]
    });
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([localizedActivity]));

    const options = await getCanonicalWorkoutFilterOptionsWithStatus("ar");
    expect(options.data.equipmentRequired).toEqual([{ value: "dumbbell", label: "دُمبل", aliases: [] }]);
    expect(options.data.exerciseTypes).toEqual([{ value: "strength", label: "قوة", aliases: [] }]);

    await getWorkoutsWithStatus("", { equipmentRequired: ["dumbbell"], exerciseTypes: ["strength"] }, 0, "ar");
    expect(catalogClient.searchCatalogActivities).toHaveBeenLastCalledWith(expect.objectContaining({
      equipment: ["dumbbell"], activityType: "strength", locale: "ar"
    }), "test-catalog-group");

    const legacyLocalizedSelection = await getWorkoutsWithStatus("", { equipmentRequired: ["دُمبل"] }, 0, "ar");
    expect(catalogClient.searchCatalogActivities).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ equipment: expect.anything() }),
      "test-catalog-group"
    );
    expect(legacyLocalizedSelection.data.map((workout) => workout.id)).toEqual(["arabic"]);
  });

  it("matches Arabic custom exercise queries and canonical filter selections across diacritics", () => {
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

  it("returns the provider cursor and hasMore truthfully across compatibility-filtered pages", async () => {
    catalogClient.searchCatalogActivities.mockImplementation(async ({ offset = 0 }: { offset?: number }) => {
      if (offset >= 500) {
        return searchResult(Array.from({ length: 20 }, (_, index) => activity(`tail-${index}`)), offset, null);
      }
      return searchResult(
        Array.from({ length: 100 }, (_, index) => activity(`${offset + index}`)),
        offset,
        offset + 100
      );
    });

    const first = await getWorkoutsWithStatus("", {}, 0);
    expect(first.data).toHaveLength(500);
    expect(first.pagination).toEqual({ hasMore: true, nextOffset: 500 });

    const second = await getWorkoutsWithStatus("", {}, first.pagination?.nextOffset ?? 0);
    expect(second.data).toHaveLength(20);
    expect(second.pagination).toEqual({ hasMore: false, nextOffset: null });
  });
});
