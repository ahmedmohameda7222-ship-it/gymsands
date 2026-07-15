import { describe, expect, it } from "vitest";
import { activityToWorkout } from "./adapter";
import type { TrainingActivity } from "./types";

const activity: TrainingActivity = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "squat",
  name: "Squat",
  shortDescription: "Base description",
  instructions: [{ order: 1, text: "Base instruction" }],
  difficulty: "beginner",
  movementPattern: "squat",
  version: 1,
  activityType: null,
  sports: [],
  sessionTypes: [],
  sessionPhases: [],
  equipment: [],
  muscles: [{ id: "22222222-2222-4222-8222-222222222222", slug: "pectoralis-major", name: "Pectoralis Major", bodyRegion: "Upper Body", role: "primary" }],
  trainingGoals: [],
  translations: {
    de: {
      name: "Kniebeuge",
      shortDescription: "Lokalisierte Beschreibung",
      instructions: [{ order: 2, text: "Zweiter Schritt" }, { order: 1, text: "Erster Schritt" }]
    }
  },
  updatedAt: "2026-07-15T00:00:00.000Z"
};

describe("activityToWorkout localization", () => {
  it("uses the exact or base-language translation selected by provider metadata", () => {
    const workout = activityToWorkout(activity, {
      source: "external",
      degraded: false,
      catalogVersion: "v1",
      locale: "de-DE"
    });

    expect(workout.name).toBe("Kniebeuge");
    expect(workout.short_description).toBe("Lokalisierte Beschreibung");
    expect(workout.instructions).toBe("Erster Schritt\nZweiter Schritt");
    expect(workout.target_muscle).toBe("Pectoralis Major");
    expect(workout.muscle_category).toBe("Upper Body");
    expect(workout.instruction_steps?.map((step) => step.order)).toEqual([1, 2]);
  });

  it("keeps canonical content when a translation is unavailable", () => {
    const workout = activityToWorkout(activity, {
      source: "external",
      degraded: false,
      catalogVersion: "v1",
      locale: "ar"
    });

    expect(workout.name).toBe("Squat");
    expect(workout.instructions).toBe("Base instruction");
  });
});
