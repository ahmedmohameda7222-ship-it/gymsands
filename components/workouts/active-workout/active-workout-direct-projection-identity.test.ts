import { describe, expect, it } from "vitest";

import type { Workout } from "@/types";

import { directWorkoutDay } from "./active-workout-runtime-model";

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "direct-workout-1",
    plan_exercise_id: null,
    name: "Direct Bench Press",
    category: "strength",
    target_muscle: "chest",
    equipment: "barbell",
    difficulty: "intermediate",
    sets: 3,
    reps: "8",
    rest_seconds: 60,
    instructions: null,
    exercise_url: null,
    video_url: null,
    custom_video_url: null,
    notes: null,
    ...overrides
  } as Workout;
}

describe("direct workout projection identity", () => {
  it("keeps one projection identity for one immutable workout source", () => {
    const source = workout();
    const first = directWorkoutDay(source);
    const second = directWorkoutDay(source);

    expect(second).toBe(first);
    expect(second.exercises).toBe(first.exercises);
  });

  it("does not share a projection across distinct workout source objects", () => {
    const first = directWorkoutDay(workout());
    const changed = directWorkoutDay(workout({ name: "Direct Incline Press" }));

    expect(changed).not.toBe(first);
    expect(changed.day_name).toBe("Direct Incline Press");
  });
});
