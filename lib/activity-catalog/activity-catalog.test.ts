import { describe, expect, it } from "vitest";
import {
  legacyWorkoutToTrainingActivity,
  resolveWorkoutVideoUrl,
  trainingActivityToWorkout
} from "./adapters";
import {
  catalogFiltersToLegacyOptions,
  legacyFiltersRequireCompatibilityScan,
  legacyFiltersToCatalogSearch,
  matchesLegacyWorkoutFilters
} from "./filter-compatibility";
import type { ActivityCatalogFilterOptions, TrainingActivity } from "./types";
import { normalizeActivityCatalogBaseUrl, parseTrainingActivity, validateActivityCatalogSearchParams } from "./validation";

const ids = {
  activity: "11111111-1111-4111-8111-111111111111",
  type: "22222222-2222-4222-8222-222222222222",
  equipment: "33333333-3333-4333-8333-333333333333",
  primary: "44444444-4444-4444-8444-444444444444",
  secondary: "55555555-5555-4555-8555-555555555555",
  goal: "66666666-6666-4666-8666-666666666666",
  sport: "77777777-7777-4777-8777-777777777777",
  sessionType: "88888888-8888-4888-8888-888888888888",
  phase: "99999999-9999-4999-8999-999999999999"
};

const activity: TrainingActivity = {
  id: ids.activity,
  slug: "barbell_back_squat",
  name: "Barbell Back Squat",
  shortDescription: "A controlled bilateral squat performed with a barbell.",
  instructions: [{ order: 2, text: "Stand tall." }, { order: 1, text: "Brace your trunk." }],
  difficulty: "intermediate",
  movementPattern: "squat",
  version: 3,
  activityType: { id: ids.type, slug: "strength_exercise", name: "Strength Exercise" },
  metricSchema: {
    slug: "strength_repetitions",
    name: "Strength repetitions",
    fields: [
      { key: "sets", label: "Sets", type: "integer", unit: "set", required: false },
      { key: "reps", label: "Repetitions", type: "integer", unit: "rep", required: false },
      { key: "weight", label: "Weight", type: "number", unit: "kg", required: false }
    ]
  },
  sports: [{ id: ids.sport, slug: "strength_training", name: "Strength Training", isPrimary: true }],
  sessionTypes: [{ id: ids.sessionType, slug: "strength_session", name: "Strength Session", sportId: ids.sport }],
  sessionPhases: [{ id: ids.phase, slug: "main", name: "Main", sportId: ids.sport, isOptional: false }],
  equipment: [
    { id: ids.equipment, slug: "barbell", name: "Barbell", isRequired: true },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "squat_rack", name: "Squat Rack", isRequired: false }
  ],
  muscles: [
    { id: ids.primary, slug: "quadriceps", name: "Quadriceps", bodyRegion: "Lower body", role: "primary" },
    { id: ids.secondary, slug: "gluteus_maximus", name: "Gluteus Maximus", bodyRegion: "Lower body", role: "secondary" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", slug: "erector_spinae", name: "Erector Spinae", bodyRegion: "Back", role: "stabilizer" }
  ],
  trainingGoals: [
    { id: ids.goal, slug: "strength", name: "Strength", relevanceWeight: 0.9 },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", slug: "hypertrophy", name: "Hypertrophy", relevanceWeight: 0.85 }
  ],
  translations: {
    de: {
      name: "Langhantel-Kniebeuge",
      shortDescription: "Eine kontrollierte Kniebeuge mit Langhantel.",
      instructions: [{ order: 1, text: "Rumpf anspannen." }]
    },
    ar: {
      name: "قرفصاء بالبار",
      shortDescription: "قرفصاء محكومة باستخدام البار.",
      instructions: [{ order: 1, text: "ثبّت الجذع." }]
    }
  },
  publishedAt: null,
  updatedAt: "2026-07-10T08:00:00.000Z"
};

function activityWithWeight(relevanceWeight: number): TrainingActivity {
  return {
    ...activity,
    trainingGoals: [{ ...activity.trainingGoals[0], relevanceWeight }]
  };
}

describe("activity catalog runtime validation", () => {
  it("accepts a real-shaped contract response and preserves the full translations map", () => {
    expect(parseTrainingActivity(activity)).toEqual(activity);
    expect(parseTrainingActivity(activity).translations).toEqual(activity.translations);
  });

  it.each([1, 0.9, 0.85, 0.5, 0])("accepts relevanceWeight %s in the zero-to-one contract", (weight) => {
    expect(parseTrainingActivity(activityWithWeight(weight)).trainingGoals[0].relevanceWeight).toBe(weight);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects malformed relevanceWeight %s as invalid_response",
    (weight) => {
      expect(() => parseTrainingActivity(activityWithWeight(weight))).toThrow();
      try {
        parseTrainingActivity(activityWithWeight(weight));
      } catch (error) {
        expect(error).toMatchObject({ code: "invalid_response" });
      }
    }
  );

  it("rejects unknown fields, malformed IDs, and invalid instruction order", () => {
    expect(() => parseTrainingActivity({ ...activity, secret: "unexpected" })).toThrow(/unexpected field/i);
    expect(() => parseTrainingActivity({ ...activity, id: "not-a-uuid" })).toThrow(/UUID/i);
    expect(() => parseTrainingActivity({ ...activity, instructions: [{ order: 0, text: "bad" }] })).toThrow(/minimum/i);
  });

  it("rejects the internal legacy media field when received from the external contract", () => {
    expect(() => parseTrainingActivity({
      ...activity,
      legacyMediaCompatibility: { exerciseUrl: "https://legacy.example/guide", videoUrl: null }
    })).toThrow(/unexpected field/i);
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
      name: "Barbell Back Squat",
      category: "Strength Exercise",
      target_muscle: "Quadriceps",
      muscle_category: "Lower body",
      equipment: "Barbell",
      equipment_required: "Barbell",
      difficulty: "intermediate",
      force_type: null,
      secondary_muscles: ["Gluteus Maximus", "Erector Spinae"],
      notes: "A controlled bilateral squat performed with a barbell.",
      exercise_url: null,
      video_url: null,
      activity_catalog: { source: "external", activityId: ids.activity, slug: "barbell_back_squat", version: 3 }
    });
    expect(workout.instructions).toBe("1. Brace your trunk.\n2. Stand tall.");
  });

  it("keeps canonical English name as the Phase 0B Workout and plan-snapshot name", () => {
    const workout = trainingActivityToWorkout(activity, "external");
    expect(workout.name).toBe(activity.name);
    expect(workout.name).not.toBe(activity.translations.de.name);
    expect(workout.name).not.toBe(activity.translations.ar.name);
  });

  it("uses Varies rather than inventing bodyweight when no equipment is required", () => {
    const workout = trainingActivityToWorkout({ ...activity, equipment: [] });
    expect(workout.equipment).toBe("Varies");
  });

  it("preserves legacy guide and video media through both compatibility adapters", () => {
    const legacyWorkout = {
      ...trainingActivityToWorkout(activity, "legacy"),
      id: "legacy-squat",
      exercise_url: "https://legacy.example/guide/squat",
      video_url: "https://legacy.example/video/squat.mp4",
      notes: "Keep the knees tracking.",
      activity_catalog: null
    };
    const canonical = legacyWorkoutToTrainingActivity(legacyWorkout);
    const roundTrip = trainingActivityToWorkout(canonical, "legacy");

    expect(canonical.legacyMediaCompatibility).toEqual({
      exerciseUrl: legacyWorkout.exercise_url,
      videoUrl: legacyWorkout.video_url
    });
    expect(roundTrip.exercise_url).toBe(legacyWorkout.exercise_url);
    expect(roundTrip.video_url).toBe(legacyWorkout.video_url);
    expect(roundTrip.notes).toBe("Keep the knees tracking.");
  });

  it("never attaches legacy media to an external activity, including one with a matching name", () => {
    const withLegacyMedia: TrainingActivity = {
      ...activity,
      legacyMediaCompatibility: {
        exerciseUrl: "https://legacy.example/guide/same-name",
        videoUrl: "https://legacy.example/video/same-name.mp4"
      }
    };
    expect(trainingActivityToWorkout(withLegacyMedia, "external")).toMatchObject({
      name: activity.name,
      exercise_url: null,
      video_url: null
    });
  });

  it("keeps user custom video precedence and resets to the source-appropriate default", () => {
    const legacy = trainingActivityToWorkout(legacyWorkoutToTrainingActivity({
      ...trainingActivityToWorkout(activity, "legacy"),
      id: "legacy-video",
      video_url: "https://legacy.example/default.mp4"
    }), "legacy");
    const external = trainingActivityToWorkout(activity, "external");

    expect(resolveWorkoutVideoUrl(legacy, "https://user.example/custom.mp4")).toBe("https://user.example/custom.mp4");
    expect(resolveWorkoutVideoUrl(legacy, "")).toBe("https://legacy.example/default.mp4");
    expect(resolveWorkoutVideoUrl(external, "https://user.example/custom.mp4")).toBe("https://user.example/custom.mp4");
    expect(resolveWorkoutVideoUrl(external, "")).toBeNull();
  });
});

describe("legacy filter compatibility", () => {
  it("maps exactly one supported value upstream", () => {
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

  it("omits multi-select groups upstream rather than collapsing them to the first selection", () => {
    const params = legacyFiltersToCatalogSearch("", {
      equipmentRequired: ["Barbell", "Dumbbell"],
      experienceLevels: ["Beginner", "Intermediate"],
      exerciseTypes: ["Strength Exercise", "Mobility Exercise"],
      forceTypes: ["Push"]
    }, 0, 100);
    expect(params).not.toHaveProperty("equipment");
    expect(params).not.toHaveProperty("difficulty");
    expect(params).not.toHaveProperty("activityType");
    expect(params).not.toHaveProperty("forceType");
    expect(legacyFiltersRequireCompatibilityScan({
      equipmentRequired: ["Barbell", "Dumbbell"],
      experienceLevels: ["Beginner", "Intermediate"],
      exerciseTypes: ["Strength Exercise", "Mobility Exercise"],
      forceTypes: ["Push"]
    })).toBe(true);
  });

  it("applies complete OR semantics locally for equipment, experience, and category/type", () => {
    const barbellIntermediate = trainingActivityToWorkout(activity);
    const dumbbellBeginner = {
      ...barbellIntermediate,
      id: "dumbbell-row",
      name: "Dumbbell Row",
      equipment: "Dumbbell",
      equipment_required: "Dumbbell",
      difficulty: "beginner",
      experience_level: "beginner",
      category: "Mobility Exercise"
    };
    const cableAdvanced = {
      ...barbellIntermediate,
      id: "cable-row",
      equipment: "Cable",
      equipment_required: "Cable",
      difficulty: "advanced",
      experience_level: "advanced",
      category: "Cardio Exercise"
    };
    const filters = {
      equipmentRequired: ["Barbell", "Dumbbell"],
      experienceLevels: ["Beginner", "Intermediate"],
      exerciseTypes: ["Strength Exercise", "Mobility Exercise"]
    };

    expect(matchesLegacyWorkoutFilters(barbellIntermediate, "", filters)).toBe(true);
    expect(matchesLegacyWorkoutFilters(dumbbellBeginner, "", filters)).toBe(true);
    expect(matchesLegacyWorkoutFilters(cableAdvanced, "", filters)).toBe(false);
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
      muscleCategories: ["Back", "Lower body"],
      primaryMuscles: ["Quadriceps"],
      equipmentRequired: ["Barbell"],
      mechanics: ["squat"],
      exerciseTypes: ["Strength Exercise"],
      forceTypes: [],
      experienceLevels: ["intermediate"],
      secondaryMuscles: ["Erector Spinae", "Gluteus Maximus"]
    });
  });
});
