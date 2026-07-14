import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWorkoutVideoUrl } from "@/lib/activity-catalog/adapters";
import type { Workout } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const externalActivityId = "88888888-8888-4888-8888-888888888888";
const legacyActivityId = "legacy-bench-press";

const { state, supabase } = vi.hoisted(() => {
  const state: {
    table: string;
    upsert: unknown;
    match: unknown;
    favoriteRows: Array<{ exercise_id: string }>;
  } = { table: "", upsert: null, match: null, favoriteRows: [] };

  function from(table: string) {
    state.table = table;
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => ({ data: state.upsert, error: null })),
      upsert: vi.fn((payload: unknown) => {
        state.upsert = payload;
        return builder;
      }),
      delete: vi.fn(() => builder),
      match: vi.fn(async (payload: unknown) => {
        state.match = payload;
        return { error: null };
      }),
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: state.favoriteRows, error: null }).then(resolve);
      }
    };
    return builder;
  }

  return { state, supabase: { from: vi.fn(from) } };
});

vi.mock("@/lib/supabase/client", () => ({ supabase }));

import { getUserExerciseVideo, resetUserExerciseVideo, upsertUserExerciseVideo } from "@/services/database/exercise-user-data";
import { setFavoriteExercise } from "@/services/workouts/exercise-library-store";

const baseWorkout: Workout = {
  id: externalActivityId,
  name: "Bench Press",
  category: "Strength Exercise",
  target_muscle: "Pectoralis Major",
  equipment: "Barbell",
  difficulty: "Intermediate",
  sets: 3,
  reps: "8-12",
  rest_seconds: 90,
  instructions: "Press with control.",
  notes: null,
  exercise_url: null,
  video_url: null,
  custom_video_url: null,
  is_global: true
};

beforeEach(() => {
  state.table = "";
  state.upsert = null;
  state.match = null;
  state.favoriteRows = [];
  vi.clearAllMocks();
});

describe("external activity user data compatibility", () => {
  it("keeps mock or signed-out read paths non-destructive", async () => {
    await expect(getUserExerciseVideo("local-mock-user", externalActivityId)).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("stores and resets a custom video against an external activity UUID only in Plaivra", async () => {
    await upsertUserExerciseVideo(userId, externalActivityId, "https://media.example.test/form.mp4");
    expect(supabase.from).toHaveBeenLastCalledWith("user_exercise_videos");
    expect(state.upsert).toEqual({
      user_id: userId,
      exercise_id: externalActivityId,
      custom_video_url: "https://media.example.test/form.mp4"
    });

    await expect(resetUserExerciseVideo(userId, externalActivityId)).resolves.toBe(true);
    expect(supabase.from).toHaveBeenLastCalledWith("user_exercise_videos");
  });

  it("uses the custom video first, then resets to legacy default or no external default", async () => {
    const legacyWorkout: Workout = {
      ...baseWorkout,
      id: legacyActivityId,
      video_url: "https://legacy.example/default.mp4"
    };
    const customUrl = "https://media.example.test/custom.mp4";

    expect(resolveWorkoutVideoUrl(legacyWorkout, customUrl)).toBe(customUrl);
    expect(resolveWorkoutVideoUrl(baseWorkout, customUrl)).toBe(customUrl);

    await expect(resetUserExerciseVideo(userId, legacyActivityId)).resolves.toBe(true);
    expect(resolveWorkoutVideoUrl(legacyWorkout, null)).toBe("https://legacy.example/default.mp4");

    await expect(resetUserExerciseVideo(userId, externalActivityId)).resolves.toBe(true);
    expect(resolveWorkoutVideoUrl(baseWorkout, null)).toBeNull();
  });

  it("stores and removes favorites using an external activity UUID", async () => {
    state.favoriteRows = [{ exercise_id: externalActivityId }];
    await expect(setFavoriteExercise(userId, externalActivityId, true)).resolves.toEqual([externalActivityId]);
    expect(supabase.from).toHaveBeenCalledWith("user_exercise_favorites");
    expect(state.upsert).toEqual({ user_id: userId, exercise_id: externalActivityId });

    state.favoriteRows = [];
    await expect(setFavoriteExercise(userId, externalActivityId, false)).resolves.toEqual([]);
    expect(state.match).toEqual({ user_id: userId, exercise_id: externalActivityId });
  });
});
