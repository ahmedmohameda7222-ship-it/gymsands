import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const externalActivityId = "88888888-8888-4888-8888-888888888888";

const { rpc, supabase } = vi.hoisted(() => {
  const rpc = vi.fn(async () => ({ data: { id: planId }, error: null }));
  return { rpc, supabase: { rpc } };
});

vi.mock("@/lib/supabase/client", () => ({ supabase }));

import { createUserWorkoutPlan } from "@/services/database/workout-plans";

const externalWorkout: Workout = {
  id: externalActivityId,
  name: "External bench press",
  category: "Strength",
  target_muscle: "Chest",
  muscle_category: "Upper body",
  equipment: "Barbell",
  equipment_required: "Barbell",
  difficulty: "intermediate",
  experience_level: "intermediate",
  mechanics: "horizontal_push",
  force_type: null,
  secondary_muscles: ["Triceps"],
  sets: 3,
  reps: "8-12",
  rest_seconds: 90,
  instructions: "1. Set the bar.\n2. Press with control.",
  notes: "A controlled horizontal press.",
  exercise_url: null,
  video_url: null,
  custom_video_url: null,
  is_global: true,
  activity_catalog: {
    source: "external",
    activityId: externalActivityId,
    slug: "external_bench_press",
    version: 4,
    metricSchema: {
      slug: "strength_repetitions",
      name: "Strength repetitions",
      fields: [{ key: "reps", label: "Repetitions", type: "integer", required: false }]
    }
  }
};

beforeEach(() => vi.clearAllMocks());

describe("external activity workout-plan compatibility", () => {
  it("preserves the external UUID and the complete exercise snapshot in the existing plan RPC", async () => {
    await expect(createUserWorkoutPlan({
      userId,
      planName: "External catalog plan",
      startDate: "2026-07-14",
      days: [{ dayName: "Push", weekday: "Tuesday", exercises: [externalWorkout] }]
    })).resolves.toEqual({ id: planId });

    expect(rpc).toHaveBeenCalledWith("create_workout_plan_atomic", expect.objectContaining({
      p_user_id: userId,
      p_plan: expect.objectContaining({
        days: [expect.objectContaining({
          exercises: [expect.objectContaining({
            source_workout_id: externalActivityId,
            exercise_name: externalWorkout.name,
            category: externalWorkout.category,
            target_muscle: externalWorkout.muscle_category,
            equipment: externalWorkout.equipment_required,
            sets: externalWorkout.sets,
            reps: externalWorkout.reps,
            rest_seconds: externalWorkout.rest_seconds,
            instructions: externalWorkout.instructions,
            exercise_url: null,
            video_url: null,
            custom_video_url: null,
            notes: externalWorkout.notes
          })]
        })]
      })
    }));
  });
});
