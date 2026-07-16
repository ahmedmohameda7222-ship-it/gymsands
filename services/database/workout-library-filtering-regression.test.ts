import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSourceMetadata, TrainingActivity } from "@/lib/activity-catalog/types";

const catalogClient = vi.hoisted(() => ({
  createCatalogRequestGroupId: vi.fn(() => "regression-group"),
  getCatalogActivity: vi.fn(),
  getCatalogActivityAlternatives: vi.fn(),
  getCatalogFilters: vi.fn(),
  searchCatalogActivities: vi.fn()
}));

vi.mock("@/services/activity-catalog/client", () => catalogClient);
vi.mock("@/lib/supabase/client", () => ({ supabase: null }));

import {
  getCanonicalWorkoutFilterOptionsWithStatus,
  getWorkoutsWithStatus,
  mergeWorkoutFilterOptions
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

function searchResult(data: TrainingActivity[]) {
  return { data, pagination: { limit: 60, offset: 0, returned: data.length, nextOffset: null }, meta };
}

describe("workout library filtering regressions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps body regions distinct from primary muscle names and preserves derived workout metadata", async () => {
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([
      activity("upper"),
      activity("lower", {
        muscles: [{ id: "quad", slug: "quadriceps", name: "Quadriceps", bodyRegion: "Lower Body", role: "primary" }]
      })
    ]));

    const byRegion = await getWorkoutsWithStatus("", { muscleCategories: ["upper_body"] });
    expect(byRegion.data.map((workout) => workout.id)).toEqual(["upper"]);
    expect(byRegion.data[0]?.muscle_category).toBe("Upper Body");
    expect(mergeWorkoutFilterOptions({
      muscleCategories: [], primaryMuscles: [], equipmentRequired: [], mechanics: [],
      exerciseTypes: [], forceTypes: [], experienceLevels: [], secondaryMuscles: []
    }, byRegion.data)).toMatchObject({
      muscleCategories: ["Upper Body"],
      primaryMuscles: ["Pectoralis Major"],
      mechanics: ["Horizontal Push"],
      forceTypes: ["Push"]
    });
  });

  it("keeps localized taxonomy labels separate from canonical request values", async () => {
    catalogClient.getCatalogFilters.mockResolvedValue({
      data: {
        sports: [], sessionTypes: [], sessionPhases: [], trainingGoals: [],
        activityTypes: [{ id: "strength-id", slug: "strength", name: "قوة" }],
        equipment: [{ id: "dumbbell-id", slug: "dumbbell", name: "دُمبل" }],
        difficulties: ["beginner"],
        primaryMuscles: [{ id: "chest", slug: "chest", name: "الصَّدْر" }]
      },
      meta
    });
    catalogClient.searchCatalogActivities.mockResolvedValue(searchResult([activity("arabic", {
      name: "تَمْرِين الصَّدْر",
      activityType: { id: "strength-id", slug: "strength", name: "قوة" },
      equipment: [{ id: "dumbbell-id", slug: "dumbbell", name: "دُمبل", isRequired: true }],
      muscles: [{ id: "chest", slug: "chest", name: "الصَّدْر", bodyRegion: "Upper Body", role: "primary" }]
    })]));

    const options = await getCanonicalWorkoutFilterOptionsWithStatus("ar");
    expect(options.data.equipmentRequired).toEqual([{ value: "dumbbell", label: "دُمبل", aliases: [] }]);
    expect(options.data.exerciseTypes).toEqual([{ value: "strength", label: "قوة", aliases: [] }]);

    const result = await getWorkoutsWithStatus("", { equipmentRequired: ["dumbbell"], primaryMuscles: ["chest"] }, 0, "ar");
    expect(result.data.map((workout) => workout.id)).toEqual(["arabic"]);
    expect(catalogClient.searchCatalogActivities).toHaveBeenCalledWith(expect.objectContaining({
      equipment: ["dumbbell"], primaryMuscles: ["chest"], locale: "ar"
    }), "regression-group");
  });

  it("keeps unavailable filter groups hidden instead of rendering no-op controls", () => {
    const browser = readFileSync(resolve(process.cwd(), "components/workouts/workout-browser.tsx"), "utf8");
    expect(browser).toContain("if (!availableValues.length) return null;");
    expect(browser).not.toContain("No options yet.");
  });
});
