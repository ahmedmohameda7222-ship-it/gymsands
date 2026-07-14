import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { trainingActivityToWorkout } from "@/lib/activity-catalog/adapters";
import type { ExerciseVideo, Workout } from "@/types";
import { createActivityCatalogProvider } from "./factory";
import { LegacyActivityCatalogProvider } from "./legacy-provider";

const legacyWorkout: Workout = {
  id: "legacy-workout-media",
  name: "Shared Exercise Name",
  category: "Strength",
  target_muscle: "Chest",
  equipment: "Barbell",
  difficulty: "Intermediate",
  sets: 3,
  reps: "8-12",
  rest_seconds: 90,
  instructions: "Press with control.",
  notes: "Legacy workout source.",
  muscle_category: "Upper body",
  equipment_required: "Barbell",
  mechanics: "horizontal_push",
  force_type: "push",
  experience_level: "Intermediate",
  secondary_muscles: ["Triceps"],
  exercise_url: "https://legacy.example/workout-guide",
  video_url: "https://legacy.example/workout-video.mp4",
  is_global: true
};

const legacyVideo: ExerciseVideo = {
  id: "legacy-video-media",
  exercise_name: "Shared Exercise Name",
  category_type: "Strength",
  category: "Chest",
  exercise_url: "https://legacy.example/video-guide",
  video_url: "https://legacy.example/video-record.mp4",
  instructions: "Keep the shoulders stable.",
  source: "legacy-video-table",
  muscle_category: "Upper body",
  equipment_required: "Dumbbell",
  mechanics: "horizontal_push",
  force_type: "push",
  experience_level: "Beginner",
  secondary_muscles: ["Triceps"],
  is_global: true
};

function catalogClient(rows: Record<string, unknown[]> = {}) {
  const tables: string[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: rows[table] ?? [], error: null }))
    };
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, tables };
}

describe("LegacyActivityCatalogProvider", () => {
  it("queries only the three approved global legacy sources", async () => {
    const database = catalogClient();
    const provider = new LegacyActivityCatalogProvider(database.client);
    const response = await provider.getFilters();
    expect(database.tables).toEqual(["workouts", "exercise_videos", "exercises"]);
    expect(response.meta.source).toBe("legacy");
    expect(database.tables).not.toContain("profiles");
    expect(database.tables.every((table) => !table.startsWith("user_"))).toBe(true);
  });

  it("preserves workout and exercise-video media as separate legacy identities", async () => {
    const database = catalogClient({
      workouts: [legacyWorkout],
      exercise_videos: [legacyVideo],
      exercises: []
    });
    const provider = new LegacyActivityCatalogProvider(database.client);

    const workoutActivity = await provider.getActivity(legacyWorkout.id);
    const videoActivity = await provider.getActivity(legacyVideo.id);
    const workoutRoundTrip = trainingActivityToWorkout(workoutActivity.data, "legacy");
    const videoRoundTrip = trainingActivityToWorkout(videoActivity.data, "legacy");

    expect(workoutRoundTrip).toMatchObject({
      id: legacyWorkout.id,
      name: legacyWorkout.name,
      exercise_url: legacyWorkout.exercise_url,
      video_url: legacyWorkout.video_url
    });
    expect(videoRoundTrip).toMatchObject({
      id: legacyVideo.id,
      name: legacyVideo.exercise_name,
      exercise_url: legacyVideo.exercise_url,
      video_url: legacyVideo.video_url
    });
    expect(workoutRoundTrip.id).not.toBe(videoRoundTrip.id);
  });

  it("uses deterministic local compatibility data when the database is unavailable", async () => {
    const provider = new LegacyActivityCatalogProvider(null);
    const response = await provider.searchActivities({ query: "Barbell Back Squat", limit: 10 });
    expect(response.data[0]).toMatchObject({ id: "workout-barbell-back-squat", name: "Barbell Back Squat" });
    expect(response.meta).toMatchObject({ source: "legacy", degraded: true });
    expect(response.pagination?.returned).toBeGreaterThanOrEqual(1);
  });

  it("resolves legacy identifiers and bounds deterministic alternatives", async () => {
    const provider = new LegacyActivityCatalogProvider(null);
    const detail = await provider.getActivity("workout-barbell-back-squat");
    expect(detail.data.id).toBe("workout-barbell-back-squat");
    const alternatives = await provider.getActivityAlternatives("workout-barbell-back-squat", { limit: 2 });
    expect(alternatives.data.length).toBeLessThanOrEqual(2);
    await expect(provider.getActivityAlternatives("workout-barbell-back-squat", { limit: 21 }))
      .rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("createActivityCatalogProvider", () => {
  it("keeps legacy mode buildable without an external key", async () => {
    const provider = createActivityCatalogProvider({ supabase: null, mode: "legacy", apiKey: "" });
    await expect(provider.searchActivities({ query: "squat", limit: 1 })).resolves.toMatchObject({ meta: { source: "legacy" } });
  });

  it("fails closed when an external mode has no server key", () => {
    expect(() => createActivityCatalogProvider({
      supabase: null,
      mode: "external",
      baseUrl: "https://catalog.example.test",
      apiKey: ""
    })).toThrow(/not configured/i);
  });
});
