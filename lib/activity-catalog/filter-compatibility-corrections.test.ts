import { describe, expect, it } from "vitest";
import type { Workout } from "@/types";
import {
  legacyFiltersRequireCompatibilityScan,
  legacyFiltersToCatalogSearch,
  matchesLegacyWorkoutFilters
} from "./filter-compatibility";

const baseWorkout: Workout = {
  id: "activity-1",
  name: "Barbell Squat",
  category: "Strength Exercise",
  target_muscle: "Quadriceps",
  equipment: "Barbell",
  difficulty: "Intermediate",
  sets: 3,
  reps: "8-12",
  rest_seconds: 90,
  instructions: "Squat with control.",
  notes: null,
  mechanics: "squat",
  experience_level: "Intermediate",
  is_global: true
};

describe("combined legacy category and activity-type compatibility", () => {
  it("treats category aliases and exercise types as one local OR group", () => {
    const filters = {
      categories: ["Mobility Exercise"],
      exerciseTypes: ["Strength Exercise"]
    };
    expect(legacyFiltersRequireCompatibilityScan(filters)).toBe(true);
    expect(legacyFiltersToCatalogSearch("", filters, 0, 100)).not.toHaveProperty("activityType");
    expect(matchesLegacyWorkoutFilters(baseWorkout, "", filters)).toBe(true);
    expect(matchesLegacyWorkoutFilters({ ...baseWorkout, category: "Mobility Exercise" }, "", filters)).toBe(true);
    expect(matchesLegacyWorkoutFilters({ ...baseWorkout, category: "Cardio Exercise" }, "", filters)).toBe(false);
  });
});
