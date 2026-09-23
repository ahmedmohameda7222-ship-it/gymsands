import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentGenerationQuality } from "@/services/food-catalog/server/current-generation-quality";

type Row = Record<string, unknown>;
type TableFixture = { rows: Row[]; rangeErrorAt?: number };
type Query = Record<string, ReturnType<typeof vi.fn>> & PromiseLike<{ data: unknown; error: null | { message: string } }>;

const GENERATION_ID = "11111111-1111-4111-8111-111111111111";
const STALE_GENERATION_ID = "22222222-2222-4222-8222-222222222222";

function uuid(prefix: string, index: number) {
  return `${prefix}0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function makeSupabase(fixtures: Record<string, TableFixture>) {
  const queries: Record<string, Query[]> = {};
  const from = vi.fn((table: string) => {
    const fixture = fixtures[table] ?? { rows: [] };
    const equals: Array<[string, unknown]> = [];
    const inFilters: Array<[string, Set<unknown>]> = [];
    const orders: string[] = [];
    let explicitLimit: number | null = null;

    const apply = () => {
      const filtered = fixture.rows.filter((row) => (
        equals.every(([column, value]) => row[column] === value)
        && inFilters.every(([column, values]) => values.has(row[column]))
      ));
      return [...filtered].sort((left, right) => {
        for (const column of orders) {
          const a = String(left[column] ?? "");
          const b = String(right[column] ?? "");
          const compared = a.localeCompare(b);
          if (compared !== 0) return compared;
        }
        return 0;
      });
    };

    const terminal = () => {
      const rows = apply();
      const max = explicitLimit ?? 1000;
      return { data: rows.slice(0, max), error: null as null };
    };

    const query = {
      then: ((resolve: (value: { data: unknown; error: null }) => unknown) => Promise.resolve(terminal()).then(resolve)) as Query["then"],
    } as Query;
    query.select = vi.fn(() => query);
    query.eq = vi.fn((column: string, value: unknown) => {
      equals.push([column, value]);
      return query;
    });
    query.in = vi.fn((column: string, values: unknown[]) => {
      inFilters.push([column, new Set(values)]);
      return query;
    });
    query.order = vi.fn((column: string) => {
      orders.push(column);
      return query;
    });
    query.limit = vi.fn((value: number) => {
      explicitLimit = value;
      return query;
    });
    query.range = vi.fn(async (start: number, end: number) => {
      if (fixture.rangeErrorAt === start) return { data: null, error: { message: "forced later page failure" } };
      return { data: apply().slice(start, end + 1), error: null };
    });
    query.maybeSingle = vi.fn(async () => {
      const rows = apply();
      return { data: rows[0] ?? null, error: null };
    });

    (queries[table] ??= []).push(query);
    return query;
  });
  return { supabase: { from } as unknown as SupabaseClient, queries, from };
}

function pointerRows() {
  return [{ singleton_key: true, current_generation_id: GENERATION_ID }];
}

describe("Plan 7 generation-wide admin quality pagination", () => {
  it("counts every active Food beyond 5,000 and lets a Food after the old cap contribute to missing-macro metrics", async () => {
    const foods = Array.from({ length: 5001 }, (_, index) => ({
      generation_id: GENERATION_ID,
      food_id: uuid("3", index),
      nutrition_revision_id: uuid("4", index),
      lifecycle: "active",
    }));
    const stale = {
      generation_id: STALE_GENERATION_ID,
      food_id: uuid("5", 1),
      nutrition_revision_id: uuid("6", 1),
      lifecycle: "active",
    };
    const nutrition = foods.map((food, index) => ({
      id: food.nutrition_revision_id,
      calories: 100,
      protein_g: index === 5000 ? null : 10,
      carbs_g: 20,
      fat_g: 5,
    }));
    const db = makeSupabase({
      food_catalog_current_generation: { rows: pointerRows() },
      food_catalog_generation_foods: { rows: [...foods, stale] },
      food_catalog_generation_names: { rows: [] },
      food_nutrition_revisions: { rows: nutrition },
      food_names: { rows: [] },
    });

    await expect(getCurrentGenerationQuality(db.supabase)).resolves.toMatchObject({
      generationId: GENERATION_ID,
      activeFoodCount: 5001,
      foodsMissingMacros: 1,
    });

    const pages = db.queries.food_catalog_generation_foods;
    expect(pages).toHaveLength(6);
    expect(pages.map((query) => query.range.mock.calls[0])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
      [5000, 5999],
    ]);
    for (const query of pages) {
      expect(query.eq).toHaveBeenCalledWith("generation_id", GENERATION_ID);
      expect(query.eq).toHaveBeenCalledWith("lifecycle", "active");
      expect(query.order).toHaveBeenCalledWith("food_id", { ascending: true });
      expect(query.limit).not.toHaveBeenCalled();
    }
  });

  it("considers selected Name rows beyond 10,000 so a duplicate existing only after the old cap is detected", async () => {
    const foodA = uuid("7", 1);
    const foodB = uuid("7", 2);
    const nameSelections = Array.from({ length: 10001 }, (_, index) => ({
      generation_id: GENERATION_ID,
      food_id: index < 10000 ? foodA : foodB,
      name_fact_id: uuid("8", index),
    }));
    const names = nameSelections.map((selection, index) => ({
      id: selection.name_fact_id,
      food_id: selection.food_id,
      language_tag: "en",
      normalized_text: index === 0 || index === 10000 ? "duplicate edge" : `unique-${index}`,
      name_text: index === 0 || index === 10000 ? "Duplicate edge" : `Unique ${index}`,
    }));
    const db = makeSupabase({
      food_catalog_current_generation: { rows: pointerRows() },
      food_catalog_generation_foods: {
        rows: [
          { generation_id: GENERATION_ID, food_id: foodA, nutrition_revision_id: null, lifecycle: "active" },
          { generation_id: GENERATION_ID, food_id: foodB, nutrition_revision_id: null, lifecycle: "active" },
        ],
      },
      food_catalog_generation_names: { rows: nameSelections },
      food_nutrition_revisions: { rows: [] },
      food_names: { rows: names },
    });

    await expect(getCurrentGenerationQuality(db.supabase)).resolves.toMatchObject({
      generationId: GENERATION_ID,
      activeFoodCount: 2,
      duplicateSelectedNames: 1,
    });

    const pages = db.queries.food_catalog_generation_names;
    expect(pages).toHaveLength(11);
    expect(pages[0]!.range).toHaveBeenCalledWith(0, 999);
    expect(pages[10]!.range).toHaveBeenCalledWith(10000, 10999);
    for (const query of pages) {
      expect(query.eq).toHaveBeenCalledWith("generation_id", GENERATION_ID);
      expect(query.order.mock.calls.map((call) => call[0])).toEqual(["food_id", "name_fact_id"]);
      expect(query.limit).not.toHaveBeenCalled();
    }
    expect(db.queries.food_names.length).toBeGreaterThan(1);
    for (const query of db.queries.food_names) {
      const ids = query.in.mock.calls[0]?.[1] as unknown[];
      expect(ids.length).toBeLessThanOrEqual(100);
    }
  });

  it("fails instead of returning prefix metrics when a later active-Food page fails", async () => {
    const foods = Array.from({ length: 1001 }, (_, index) => ({
      generation_id: GENERATION_ID,
      food_id: uuid("9", index),
      nutrition_revision_id: null,
      lifecycle: "active",
    }));
    const db = makeSupabase({
      food_catalog_current_generation: { rows: pointerRows() },
      food_catalog_generation_foods: { rows: foods, rangeErrorAt: 1000 },
      food_catalog_generation_names: { rows: [] },
      food_nutrition_revisions: { rows: [] },
      food_names: { rows: [] },
    });

    await expect(getCurrentGenerationQuality(db.supabase)).rejects.toThrow(/quality.*Foods|later page|failed/i);
  });

  it("keeps generation-wide fact reads targeted and chunked so backend row defaults cannot truncate them", async () => {
    const foods = Array.from({ length: 1201 }, (_, index) => ({
      generation_id: GENERATION_ID,
      food_id: uuid("a", index),
      nutrition_revision_id: uuid("b", index),
      lifecycle: "active",
    }));
    const nutrition = foods.map((food) => ({
      id: food.nutrition_revision_id,
      calories: 100,
      protein_g: 10,
      carbs_g: 20,
      fat_g: 5,
    }));
    const db = makeSupabase({
      food_catalog_current_generation: { rows: pointerRows() },
      food_catalog_generation_foods: { rows: foods },
      food_catalog_generation_names: { rows: [] },
      food_nutrition_revisions: { rows: nutrition },
      food_names: { rows: [] },
    });

    await expect(getCurrentGenerationQuality(db.supabase)).resolves.toMatchObject({
      activeFoodCount: 1201,
      foodsMissingMacros: 0,
    });

    expect(db.queries.food_nutrition_revisions.length).toBeGreaterThan(1);
    for (const query of db.queries.food_nutrition_revisions) {
      const ids = query.in.mock.calls[0]?.[1] as unknown[];
      expect(ids.length).toBeLessThanOrEqual(100);
    }
  });
});
