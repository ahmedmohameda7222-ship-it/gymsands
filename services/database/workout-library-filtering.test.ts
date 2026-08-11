import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Workout } from "@/types";
import {
  emptyCanonicalWorkoutFilterOptions,
  matchesWorkoutRecord
} from "./workout-library";

describe("workout library canonical filtering", () => {
  it("matches primary and secondary muscles through canonical options", () => {
    const workout: Workout = {
      id: "w1",
      name: "Bench Press",
      category: "strength",
      target_muscle: "Pectoralis Major",
      equipment: "Barbell",
      difficulty: "Intermediate",
      sets: null,
      reps: null,
      rest_seconds: null,
      instructions: "",
      notes: null,
      is_global: true,
      secondary_muscles: ["Triceps"]
    };
    const options = emptyCanonicalWorkoutFilterOptions();
    options.primaryMuscles = [{ value: "chest", label: "Chest", aliases: ["pectoralis major"] }];
    options.secondaryMuscles = [{ value: "triceps", label: "Triceps" }];

    expect(matchesWorkoutRecord(workout, "", { primaryMuscles: ["chest"] }, options)).toBe(true);
    expect(matchesWorkoutRecord(workout, "", { secondaryMuscles: ["triceps"] }, options)).toBe(true);
    expect(matchesWorkoutRecord(workout, "", { primaryMuscles: ["back"] }, options)).toBe(false);
  });

  it("matches equipment and difficulty from canonical values", () => {
    const workout: Workout = {
      id: "w2",
      name: "Goblet Squat",
      category: "strength",
      target_muscle: "Quadriceps",
      equipment: "Dumbbell",
      difficulty: "Beginner",
      sets: null,
      reps: null,
      rest_seconds: null,
      instructions: "",
      notes: null,
      is_global: true
    };
    const options = emptyCanonicalWorkoutFilterOptions();
    options.equipmentRequired = [{ value: "dumbbell", label: "Dumbbell" }];
    options.experienceLevels = [{ value: "beginner", label: "Beginner" }];

    expect(matchesWorkoutRecord(workout, "", { equipmentRequired: ["dumbbell"] }, options)).toBe(true);
    expect(matchesWorkoutRecord(workout, "", { experienceLevels: ["beginner"] }, options)).toBe(true);
    expect(matchesWorkoutRecord(workout, "", { equipmentRequired: ["barbell"] }, options)).toBe(false);
  });

  it("uses stable identifiers for catalog metadata when available", () => {
    const workout: Workout = {
      id: "w3",
      name: "Cable Row",
      category: "strength",
      target_muscle: "Back",
      equipment: "Cable",
      difficulty: "Intermediate",
      sets: null,
      reps: null,
      rest_seconds: null,
      instructions: "",
      notes: null,
      is_global: true,
      catalog_slug: "cable-row",
      catalog_filter_dimensions: {
        primaryMuscles: ["latissimus_dorsi"],
        equipmentRequired: ["cable_machine"],
        experienceLevels: ["intermediate"]
      }
    };
    const options = emptyCanonicalWorkoutFilterOptions();
    options.primaryMuscles = [{ value: "latissimus_dorsi", label: "Latissimus dorsi" }];
    options.equipmentRequired = [{ value: "cable_machine", label: "Cable machine" }];
    options.experienceLevels = [{ value: "intermediate", label: "Intermediate" }];

    expect(matchesWorkoutRecord(workout, "", {
      primaryMuscles: ["latissimus_dorsi"],
      equipmentRequired: ["cable_machine"],
      experienceLevels: ["intermediate"]
    }, options)).toBe(true);
  });

  it("requires every selected multi-value dimension", () => {
    const workout: Workout = {
      id: "w4",
      name: "Push Up",
      category: "strength",
      target_muscle: "Chest",
      equipment: "Bodyweight",
      difficulty: "Beginner",
      sets: null,
      reps: null,
      rest_seconds: null,
      instructions: "",
      notes: null,
      is_global: true,
      catalog_filter_dimensions: {
        primaryMuscles: ["chest"],
        equipmentRequired: ["bodyweight"]
      }
    };
    const options = emptyCanonicalWorkoutFilterOptions();
    options.primaryMuscles = [{ value: "chest", label: "Chest" }, { value: "back", label: "Back" }];

    expect(matchesWorkoutRecord(workout, "", { primaryMuscles: ["chest"] }, options)).toBe(true);
    expect(matchesWorkoutRecord(workout, "", { primaryMuscles: ["chest", "back"] }, options)).toBe(false);
  });

  it("normalizes localized display labels without making them identifiers", () => {
    const workout: Workout = {
      id: "w5",
      name: "Kniebeuge",
      category: "strength",
      target_muscle: "Quadrizeps",
      equipment: "Langhantel",
      difficulty: "Fortgeschritten",
      sets: null,
      reps: null,
      rest_seconds: null,
      instructions: "",
      notes: null,
      is_global: true
    };
    const options = emptyCanonicalWorkoutFilterOptions();
    options.primaryMuscles = [{ value: "quadriceps", label: "Quadrizeps" }];
    options.equipmentRequired = [{ value: "barbell", label: "Langhantel" }];
    options.experienceLevels = [{ value: "advanced", label: "Fortgeschritten" }];

    expect(matchesWorkoutRecord(workout, "", {
      primaryMuscles: ["quadriceps"],
      equipmentRequired: ["barbell"],
      experienceLevels: ["advanced"]
    }, options)).toBe(true);
  });

  it("keeps custom workouts searchable with canonical filter labels", () => {
    const custom: Workout = {
      id: "custom-1",
      name: "تمرين الصدر",
      category: "strength",
      target_muscle: "الصدر",
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

  it("locks the source contract to explicit cursor pagination and active cancellation", () => {
    const library = readFileSync(resolve(process.cwd(), "services/database/workout-library.ts"), "utf8");
    const picker = readFileSync(resolve(process.cwd(), "components/workouts/exercise-picker-dialog.tsx"), "utf8");

    expect(library).toContain("WORKOUT_LIBRARY_PAGE_SIZE = 60");
    expect(library).not.toContain("maxCatalogRequestsPerPage");
    expect(library).not.toContain("catalogRequestPageSize");
    expect(picker).not.toContain("slice(0, 60)");
    expect(picker).toContain("AbortController");
    expect(picker).toContain("data-picker-load-more");
    expect(picker).toContain("pagination.nextCursor");
    expect(picker).not.toContain("pagination.nextOffset");
  });
});