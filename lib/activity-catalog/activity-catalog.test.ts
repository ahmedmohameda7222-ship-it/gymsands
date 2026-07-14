import { describe, expect, it } from "vitest";
import { legacyWorkoutToTrainingActivity, trainingActivityToWorkout } from "./adapters";
import { catalogFiltersToLegacyOptions, legacyFiltersToCatalogSearch } from "./filter-compatibility";
import type { ActivityCatalogFilterOptions, TrainingActivity } from "./types";
import { normalizeActivityCatalogBaseUrl, parseTrainingActivity, validateActivityCatalogSearchParams } from "./validation";

const ids = {
  activity: "11111111-1111-4111-8111-111111111111",
  type: "22222222-2222-4222-8222-222222222222",
  equipment: "33333333-3333-4333-8333-333333333333",
  primary: "44444444-4444-4444-8444-444444444444",
  secondary: "55555555-5555-4555-8555-555555555555"
};

const activity: TrainingActivity = {
  id: ids.activity,
  slug: "barbell_squat",
  name: "Barbell Squat",
  shortDescription: "A controlled squat.",
  instructions: [{ order: 2, text: "Stand tall." }, { order: 1, text: "Brace your trunk." }],
  difficulty: "intermediate",
  movementPattern: "squat",
  version: 3,
  activityType: { id: ids.type, slug: "strength", name: "Strength" },
  metricSchema: {
    slug: "strength_sets",
    name: "Strength sets",
    fields: [{ key: "reps", label: "Reps", type: "integer", required: true }]
  },
  sports: [],
  sessionTypes: [],
  sessionPhases: [],
  equipment: [
    { id: ids.equipment, slug: "barbell", name: "Barbell", isRequired: true },
    { id: "66666666-6666-4666-8666-666666666666", slug: "rack", name: "Rack", isRequired: false }
  ],
  muscles: [
    { id: ids.primary, slug: "quadriceps", name: "Quadriceps", bodyRegion: "Lower body", role: "primary" },
    { id: ids.secondary, slug: "glutes", name: "Glutes", bodyRegion: "Lower body", role: "secondary" },
    { id: "77777777-7777-4777-8777-777777777777", slug: "glutes_stabilizer", name: "Glutes", bodyRegion: "Lower body", role: "stabilizer" }
  ],
  trainingGoals: [],
  translations: { de: { name: "Kniebeuge", instructions: [{ order: 1, text: "Rumpf anspannen." }] } },
  publishedAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z"
};

describe("activity catalog runtime validation", () => {
  it("accepts the contract shape and rejects unknown or malformed upstream fields", () => {
    expect(parseTrainingActivity(activity)).toEqual(activity);
    expect(() => parseTrainingActivity({ ...activity, secret: "unexpected" })).toThrow(/unexpected field/i);
    expect(() => parseTrainingActivity({ ...activity, id: "not-a-uuid" })).toThrow(/UUID/i);
    expect(() => parseTrainingActivity({ ...activity, instructions: [{ order: 0, text: "bad" }] })).toThrow(/minimum/i);
  });

  it("normalizes safe base URLs and rejects unsafe production URLs", () => {
    expect(normalizeActivityCatalogBaseUrl("https://catalog.example.test/"))
      .toBe("https://catalog.example.test");
    expect(normalizeActivityCatalogBaseUrl("http://localhost:4000/", { allowLocalHttp: true }))
      .toBe("http://localhost:4000");
    expect(() => normalizeActivityCatalogBaseUrl("https://user:pass@catalog.example.test?q=1"))
      .toThrow();
    expect(() => normalizeActivityCatalogBaseUrl("http://catalog.example.test"))
      .toThrow();
  });

  it("bounds pagination and validates allowlisted search values", () => {
    expect(validateActivityCatalogSearchParams({ limit: 100, offset: 0, equipment: ["barbell", "barbell"] }))
      .toMatchObject({ limit: 100, offset: 0, equipment: ["barbell"], locale: "en" });
    expect(() => validateActivityCatalogSearchParams({ limit: 101 })).toThrow();
    expect(() => validateActivityCatalogSearchParams({ activityType: "../unsafe" })).toThrow();
  });
});

describe("canonical activity compatibility adapters", () => {
  it("maps ordered instructions, required equipment, muscle roles, and typed source metadata", () => {
    const workout = trainingActivityToWorkout(activity);
    expect(workout).toMatchObject({
      id: ids.activity,
      category: "Strength",
      target_muscle: "Quadriceps",
      muscle_category: "Lower body",
      equipment: "Barbell",
      equipment_required: "Barbell",
      difficulty: "intermediate",
      force_type: null,
      secondary_muscles: ["Glutes"],
      notes: "A controlled squat.",
      exercise_url: null,
      video_url: null,
      activity_catalog: { source: "external", activityId: ids.activity, slug: "barbell_squat", version: 3 }
    });
    expect(workout.instructions).toBe("1. Brace your trunk.\n2. Stand tall.");
  });

  it("uses Varies rather than inventing bodyweight when no equipment is required", () => {
    const workout = trainingActivityToWorkout({ ...activity, equipment: [] });
    expect(workout.equipment).toBe("Varies");
  });

  it("centralizes the reverse legacy mapping without serializing metadata into notes", () => {
    const canonical = legacyWorkoutToTrainingActivity({
      ...trainingActivityToWorkout(activity, "legacy"),
      id: "legacy-squat",
      notes: "Keep the knees tracking.",
      activity_catalog: null
    });
    expect(canonical.id).toBe("legacy-squat");
    expect(canonical.shortDescription).toBe("Keep the knees tracking.");
    expect(canonical.metricSchema).toBeNull();
    expect(canonical.updatedAt).toBeNull();
  });
});

describe("legacy filter compatibility", () => {
  it("maps only supported filters to one bounded external request", () => {
    expect(legacyFiltersToCatalogSearch(" squat ", {
      equipmentRequired: ["Olympic Barbell"],
      exerciseTypes: ["Strength Training"],
      experienceLevels: ["Intermediate"],
      primaryMuscles: ["Quadriceps"]
    }, 2, 100)).toEqual({
      query: "squat",
      equipment: ["olympic_barbell"],
      activityType: "strength_training",
      difficulty: "intermediate",
      limit: 100,
      offset: 200,
      locale: "en"
    });
  });

  it("derives representable options and leaves unsupported force types empty", () => {
    const filters: ActivityCatalogFilterOptions = {
      sports: [],
      activityTypes: [activity.activityType],
      sessionTypes: [],
      sessionPhases: [],
      equipment: [activity.equipment[0]],
      trainingGoals: [],
      difficulties: ["intermediate"]
    };
    expect(catalogFiltersToLegacyOptions(filters, [activity])).toMatchObject({
      muscleCategories: ["Lower body"],
      primaryMuscles: ["Quadriceps"],
      equipmentRequired: ["Barbell"],
      mechanics: ["squat"],
      exerciseTypes: ["Strength"],
      forceTypes: [],
      experienceLevels: ["intermediate"],
      secondaryMuscles: ["Glutes"]
    });
  });
});
