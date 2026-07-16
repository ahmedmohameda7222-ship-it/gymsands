import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  __resetLegacyCatalogSnapshotCacheForTests,
  LEGACY_CATALOG_SNAPSHOT_TTL_MS,
  LegacyActivityCatalogProvider
} from "./legacy-provider";

type TableResult = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
type QueryRecord = { table: string; filters: Array<[string, unknown]>; orders: string[]; limit: number | null };

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
      const record: QueryRecord = { table, filters: [], orders: [], limit: null };
      queries.push(record);
      const chain = {
        select() { return chain; },
        eq(key: string, value: unknown) { record.filters.push([key, value]); return chain; },
        order(key: string) { record.orders.push(key); return chain; },
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

function ids(result: Awaited<ReturnType<LegacyActivityCatalogProvider["searchActivities"]>>) {
  return result.data.activities.map((activity) => activity.id);
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

    expect(ids(retry)).toContain("retry");
    expect(fixture.queries).toHaveLength(6);
  });

  it("applies compatibility filters to the complete candidate set before pagination", async () => {
    const rows = [
      ...Array.from({ length: 80 }, (_, index) => workout(`non-match-${index}`, { target_muscle: "Back" })),
      workout("late-match", { target_muscle: "Chest" })
    ];
    const fixture = createSupabase({ workouts: { data: rows, error: null } });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    const result = await provider.searchActivities({ primaryMuscles: ["chest"], limit: 60, offset: 0 });

    expect(ids(result)).toEqual(["late-match"]);
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
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      muscleCategories: ["upper_body"],
      movementPatterns: ["horizontal_push"],
      forceTypes: ["push"],
      limit: 60,
      offset: 0
    });

    expect(ids(result)).toEqual(["matching"]);
  });

  it("supports OR semantics within bounded multi-select dimensions before slicing", async () => {
    const fixture = createSupabase({
      workouts: {
        data: [
          workout("strength"),
          workout("cardio", { category: "Cardio", difficulty: "Advanced", target_muscle: "Quadriceps" }),
          workout("mobility", { category: "Mobility", difficulty: "Intermediate", target_muscle: "Hamstrings" })
        ],
        error: null
      }
    });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    const result = await provider.searchActivities({
      activityTypes: ["strength", "cardio"],
      difficulties: ["beginner", "advanced"],
      primaryMuscles: ["chest", "quadriceps"],
      limit: 60,
      offset: 0
    });

    expect(ids(result)).toEqual(["cardio", "strength"]);
  });

  it("normalizes free-text search across case and diacritics", async () => {
    const fixture = createSupabase({ workouts: { data: [workout("arabic", { name: "تَمْرِين الصَّدْر" })], error: null } });
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    const result = await provider.searchActivities({ query: "تمرين الصدر", limit: 60, offset: 0 });

    expect(ids(result)).toEqual(["arabic"]);
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

  it("uses stable primary and secondary ordering on every global source query", async () => {
    const fixture = createSupabase();
    const provider = new LegacyActivityCatalogProvider(fixture.supabase);

    await provider.getFilters();

    expect(fixture.queries.find((query) => query.table === "workouts")?.orders).toEqual(["name", "id"]);
    expect(fixture.queries.find((query) => query.table === "exercise_videos")?.orders).toEqual(["exercise_name", "id"]);
    expect(fixture.queries.find((query) => query.table === "exercises")?.orders).toEqual(["name", "id"]);
  });

  it("keeps tied-name activities in the same stable ID order after source shuffles and cache reset", async () => {
    const firstFixture = createSupabase({
      workouts: {
        data: [
          workout("same-name-c", { name: "Same Name" }),
          workout("same-name-a", { name: "Same Name" }),
          workout("same-name-b", { name: "Same Name" })
        ],
        error: null
      }
    });
    const first = await new LegacyActivityCatalogProvider(firstFixture.supabase)
      .searchActivities({ limit: 60, offset: 0 });

    __resetLegacyCatalogSnapshotCacheForTests();

    const secondFixture = createSupabase({
      workouts: {
        data: [
          workout("same-name-b", { name: "Same Name" }),
          workout("same-name-c", { name: "Same Name" }),
          workout("same-name-a", { name: "Same Name" })
        ],
        error: null
      }
    });
    const second = await new LegacyActivityCatalogProvider(secondFixture.supabase)
      .searchActivities({ limit: 60, offset: 0 });

    expect(ids(first)).toEqual(["same-name-a", "same-name-b", "same-name-c"]);
    expect(ids(second)).toEqual(ids(first));
  });

  it("keeps a tied-name group deterministic across the page-60 boundary and cache resets", async () => {
    const earlier = Array.from({ length: 58 }, (_, index) =>
      workout(`earlier-${String(index).padStart(2, "0")}`, {
        name: `A Earlier ${String(index).padStart(2, "0")}`
      })
    );
    const tiedFirstOrder = ["c", "a", "e", "b", "d"].map((suffix) =>
      workout(`boundary-${suffix}`, { name: "Boundary Activity" })
    );
    const tiedSecondOrder = ["b", "d", "a", "e", "c"].map((suffix) =>
      workout(`boundary-${suffix}`, { name: "Boundary Activity" })
    );
    const later = Array.from({ length: 4 }, (_, index) =>
      workout(`later-${String(index).padStart(2, "0")}`, {
        name: `Z Later ${String(index).padStart(2, "0")}`
      })
    );

    const loadPages = async (rows: Array<Record<string, unknown>>) => {
      const fixture = createSupabase({ workouts: { data: rows, error: null } });
      const provider = new LegacyActivityCatalogProvider(fixture.supabase);
      const page1 = await provider.searchActivities({ limit: 60, offset: 0 });
      const page2 = await provider.searchActivities({ limit: 60, offset: 60 });
      const full = await provider.searchActivities({ limit: 120, offset: 0 });
      return { page1, page2, full };
    };

    const beforeReset = await loadPages([...earlier, ...tiedFirstOrder, ...later]);
    __resetLegacyCatalogSnapshotCacheForTests();
    const afterReset = await loadPages([...later].reverse().concat(tiedSecondOrder, [...earlier].reverse()));

    const beforePage1Ids = ids(beforeReset.page1);
    const beforePage2Ids = ids(beforeReset.page2);
    const afterPage1Ids = ids(afterReset.page1);
    const afterPage2Ids = ids(afterReset.page2);
    const combined = [...beforePage1Ids, ...beforePage2Ids];
    const expected = ids(beforeReset.full);
    const duplicateCount = combined.length - new Set(combined).size;
    const missingCount = expected.filter((id) => !combined.includes(id)).length;

    expect(beforePage1Ids).toHaveLength(60);
    expect(beforePage2Ids[0]).toBe("boundary-c");
    expect(beforeReset.page1.data.pagination.nextOffset).toBe(60);
    expect(beforeReset.page2.data.pagination.nextOffset).toBeNull();
    expect(duplicateCount).toBe(0);
    expect(missingCount).toBe(0);
    expect(combined).toEqual(expected.slice(0, 120));
    expect(afterPage1Ids).toEqual(beforePage1Ids);
    expect(afterPage2Ids).toEqual(beforePage2Ids);
    expect([...afterPage1Ids, ...afterPage2Ids]).toEqual(combined);
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
