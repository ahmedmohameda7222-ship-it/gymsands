import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  __resetLegacyCatalogSnapshotCacheForTests,
  LEGACY_CATALOG_SNAPSHOT_TTL_MS,
  LegacyActivityCatalogProvider
} from "./legacy-provider";

type TableResult = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
type QueryRecord = { table: string; filters: Array<[string, unknown]>; order: string | null; limit: number | null };

function workout(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Workout ${id}`,
    category: "Strength",
    target_muscle: "Chest",
    muscle_category: "Upper Body",
    secondary_muscles: ["Triceps"],
    equipment_required: "Barbell",
    difficulty: "Beginner",
    mechanics: "Horizontal Push",
    force_type: "Push",
    is_global: true,
    ...overrides
  };
}

function createSupabase(
  initial: Partial<Record<string, TableResult>> = {},
  options: { rejectOnce?: boolean; deferred?: Promise<void> } = {}
) {
  const queries: QueryRecord[] = [];
  let rejected = false;
  const defaults: Record<string, TableResult> = {
    workouts: { data: [], error: null },
    exercise_videos: { data: [], error: null },
    exercises: { data: [], error: null }
  };
  const results = { ...defaults, ...initial };

  const supabase = {
    from(table: string) {
      const record: QueryRecord = { table, filters: [], order: null, limit: null };
      queries.push(record);
      const chain = {
        select() { return chain; },
        eq(key: string, value: unknown) { record.filters.push([key, value]); return chain; },
        order(key: string) { record.order = key; return chain; },
        async limit(value: number) {
          record.limit = value;
          if (options.deferred) await options.deferred;
          if (options.rejectOnce && !rejected) {
            rejected = true;
            throw new Error("temporary query failure");
          }
          return results[table];
        }
      };
      return chain;
    }
  };

  return { supabase: supabase as unknown as SupabaseClient, queries };
}

describe("legacy Activity Catalog performance contract", () => {
  beforeEach(() => {
    __resetLegacyCatalogSnapshotCacheForTests();
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent cold filters and activities loads and reuses the warm snapshot", async () => {
    let release!: () => void;
    const deferred = new Promise<void>((resolve) => { release = resolve; });
    const fixture = createSupabase({ workouts: { data: [workout("one")], error: null } }, { deferred });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    const filtersPromise = provider.getFilters();
    const activitiesPromise = provider.searchActivities({ limit: 60, offset: 0 });
    await Promise.resolve();
    expect(fixture.queries).toHaveLength(3);
    release();
    await Promise.all([filtersPromise, activitiesPromise]);
    await provider.searchActivities({ limit: 60, offset: 0 });

    expect(fixture.queries).toHaveLength(3);
  });

  it("reloads an expired successful snapshot", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const fixture = createSupabase({ workouts: { data: [workout("one")], error: null } });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    await provider.searchActivities({ limit: 60, offset: 0 });
    now.mockReturnValue(1_000 + LEGACY_CATALOG_SNAPSHOT_TTL_MS + 1);
    await provider.searchActivities({ limit: 60, offset: 0 });

    expect(fixture.queries).toHaveLength(6);
  });

  it("does not cache degraded or sample-fallback snapshots", async () => {
    const fixture = createSupabase({
      workouts: { data: null, error: { message: "unavailable" } },
      exercise_videos: { data: [], error: null },
      exercises: { data: [], error: null }
    });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    const first = await provider.searchActivities({ limit: 60, offset: 0 });
    const second = await provider.searchActivities({ limit: 60, offset: 0 });

    expect(first.meta.degraded).toBe(true);
    expect(second.meta.degraded).toBe(true);
    expect(fixture.queries).toHaveLength(6);
  });

  it("does not cache rejected loads and permits the next request to retry", async () => {
    const fixture = createSupabase({ workouts: { data: [workout("retry")], error: null } }, { rejectOnce: true });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    await expect(provider.searchActivities({ limit: 60, offset: 0 })).rejects.toThrow("temporary query failure");
    const retry = await provider.searchActivities({ limit: 60, offset: 0 });

    expect(retry.data.activities.map((activity) => activity.id)).toContain("retry");
    expect(fixture.queries).toHaveLength(6);
  });

  it("applies compatibility filters to the complete candidate set before pagination", async () => {
    const rows = [
      ...Array.from({ length: 80 }, (_, index) => workout(`non-match-${index}`, { target_muscle: "Back" })),
      workout("late-match", { target_muscle: "Chest" })
    ];
    const fixture = createSupabase({ workouts: { data: rows, error: null } });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    const result = await provider.searchActivities({ primaryMuscle: "chest", limit: 60, offset: 0 });

    expect(result.data.activities.map((activity) => activity.id)).toEqual(["late-match"]);
    expect(result.data.pagination).toEqual({ limit: 60, offset: 0, returned: 1, nextOffset: null });
  });

  it("supports every picker filter dimension before slicing", async () => {
    const fixture = createSupabase({
      workouts: {
        data: [
          workout("matching"),
          workout("other", {
            category: "Cardio",
            target_muscle: "Quadriceps",
            muscle_category: "Lower Body",
            secondary_muscles: ["Glutes"],
            equipment_required: "Machine",
            difficulty: "Advanced",
            mechanics: "Knee Dominant",
            force_type: "Pull"
          })
        ],
        error: null
      }
    });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    const result = await provider.searchActivities({
      query: "workout matching",
      activityType: "strength",
      difficulty: "beginner",
      equipment: ["barbell"],
      primaryMuscle: "chest",
      secondaryMuscle: "triceps",
      muscleCategory: "upper_body",
      movementPattern: "horizontal_push",
      forceType: "push",
      limit: 60,
      offset: 0
    });

    expect(result.data.activities.map((activity) => activity.id)).toEqual(["matching"]);
  });

  it("returns complete, deduplicated, deterministically sorted filter metadata", async () => {
    const fixture = createSupabase({
      workouts: {
        data: [
          workout("z", { target_muscle: "Shoulders", secondary_muscles: ["Triceps"], equipment_required: "Cable" }),
          workout("a", { target_muscle: "Chest", secondary_muscles: ["Triceps"], equipment_required: "Barbell" }),
          workout("duplicate", { target_muscle: "Chest", secondary_muscles: ["Triceps"], equipment_required: "Barbell" })
        ],
        error: null
      }
    });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    const result = await provider.getFilters();

    expect(result.data.primaryMuscles?.map((item) => item.name)).toEqual(["Chest", "Shoulders"]);
    expect(result.data.secondaryMuscles?.map((item) => item.name)).toEqual(["Triceps"]);
    expect(result.data.muscleCategories?.map((item) => item.name)).toEqual(["Upper Body"]);
    expect(result.data.movementPatterns?.map((item) => item.name)).toEqual(["Horizontal Push"]);
    expect(result.data.forceTypes?.map((item) => item.name)).toEqual(["Push"]);
    expect(result.data.equipment.map((item) => item.name)).toEqual(["Barbell", "Cable"]);
  });

  it("proves the cached snapshot queries only globally scoped rows", async () => {
    const fixture = createSupabase();
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    await provider.getFilters();

    expect(fixture.queries.map((query) => query.table)).toEqual(["workouts", "exercise_videos", "exercises"]);
    expect(fixture.queries.every((query) => query.filters.some(([key, value]) => key === "is_global" && value === true))).toBe(true);
    expect(fixture.queries.find((query) => query.table === "exercises")?.filters).toContainEqual(["is_approved", true]);
    expect(fixture.queries.flatMap((query) => query.filters).some(([key]) => key === "user_id")).toBe(false);
  });
});
