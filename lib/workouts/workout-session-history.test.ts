import { describe, expect, it } from "vitest";
import type { Workout, WorkoutSessionSummary } from "@/types";
import { findPreviousWorkoutSet } from "./workout-session-history";

const externalId = "11111111-1111-4111-8111-111111111111";
const otherExternalId = "22222222-2222-4222-8222-222222222222";
const legacyId = "33333333-3333-4333-8333-333333333333";

function workout(overrides: Partial<Workout> = {}): Workout {
  return { id: externalId, name: "Kniebeuge", category: "Kraft", target_muscle: "Quadrizeps", equipment: "Langhantel", difficulty: "Fortgeschritten", sets: null, reps: null, rest_seconds: null, instructions: "", notes: null, catalog_source: "external", is_global: true, ...overrides };
}

function history(sourceWorkoutId: string | null, exerciseName = "Squat", sessionWorkoutId: string | null = null): WorkoutSessionSummary[] {
  return [{
    id: "44444444-4444-4444-8444-444444444444",
    user_id: "55555555-5555-4555-8555-555555555555",
    workout_id: sessionWorkoutId,
    workout_name: exerciseName,
    started_at: "2026-07-14T08:00:00.000Z",
    completed_at: "2026-07-14T09:00:00.000Z",
    duration_minutes: 60,
    notes: null,
    status: "completed",
    exercise_logs: [{
      id: "66666666-6666-4666-8666-666666666666",
      workout_session_id: "44444444-4444-4444-8444-444444444444",
      plan_exercise_id: null,
      source_workout_id: sourceWorkoutId,
      exercise_name: exerciseName,
      planned_sets: null,
      planned_reps: null,
      planned_rest_seconds: null,
      set_number: 1,
      reps: 8,
      weight_kg: 80,
      notes: null,
      completed_at: "2026-07-14T08:30:00.000Z",
      created_at: "2026-07-14T08:30:00.000Z"
    }]
  }];
}

describe("stable previous-set identity", () => {
  it("matches an external activity across a locale change by source UUID", () => {
    expect(findPreviousWorkoutSet(history(externalId, "Squat"), workout())).toMatchObject({ reps: 8, weightKg: 80 });
  });

  it("does not collide when two external UUIDs share the same display name", () => {
    expect(findPreviousWorkoutSet(history(otherExternalId, "Kniebeuge"), workout())).toBeNull();
  });

  it("does not fall back to a localized name when external source identity is unavailable", () => {
    expect(findPreviousWorkoutSet(history(null, "Kniebeuge"), workout())).toBeNull();
  });

  it("preserves legacy direct-session history through the real local workout ID", () => {
    expect(findPreviousWorkoutSet(history(null, "Bench press", legacyId), workout({ id: legacyId, name: "Bench press", catalog_source: "legacy" }))).toMatchObject({ reps: 8, weightKg: 80 });
  });

  it("preserves exact-name history for user-owned custom workouts", () => {
    const custom = workout({ id: "88888888-8888-4888-8888-888888888888", name: "My circuit", catalog_source: "custom", is_global: false });
    expect(findPreviousWorkoutSet(history(null, "My circuit"), custom)).toMatchObject({ reps: 8, weightKg: 80 });
  });
});
