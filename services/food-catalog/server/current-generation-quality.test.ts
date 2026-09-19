import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentGenerationQuality } from "@/services/food-catalog/server/current-generation-quality";

type Result = { data: any; error: null | { message?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "eq", "limit", "in"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function client(queues: Record<string, ReturnType<typeof query>[]>) {
  const copy = Object.fromEntries(Object.entries(queues).map(([table, items]) => [table, [...items]])) as Record<string, ReturnType<typeof query>[]>;
  const from = vi.fn((table: string) => {
    const next = copy[table]?.shift();
    if (!next) throw new Error(`Unexpected table ${table}`);
    return next;
  });
  return { supabase: { from } as unknown as SupabaseClient, from };
}

describe("Plan 7 current-generation admin Food quality", () => {
  it("reports unavailable metrics when there is no promoted generation and never falls back to food_items", async () => {
    const db = client({
      food_catalog_current_generation: [query({ data: { current_generation_id: null }, error: null })],
    });

    await expect(getCurrentGenerationQuality(db.supabase)).resolves.toEqual({
      available: false,
      generationId: null,
      activeFoodCount: null,
      foodsMissingMacros: null,
      duplicateSelectedNames: null,
    });
    expect(db.from).not.toHaveBeenCalledWith("food_items");
  });

  it("measures exact active generation Foods, selected nutrition and selected names", async () => {
    const generationId = "11111111-1111-4111-8111-111111111111";
    const nutritionId = "22222222-2222-4222-8222-222222222222";
    const nameA = "33333333-3333-4333-8333-333333333333";
    const nameB = "44444444-4444-4444-8444-444444444444";
    const db = client({
      food_catalog_current_generation: [query({ data: { current_generation_id: generationId }, error: null })],
      food_catalog_generation_foods: [query({
        data: [
          { food_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nutrition_revision_id: nutritionId, lifecycle: "active" },
          { food_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nutrition_revision_id: null, lifecycle: "active" },
        ],
        error: null,
      })],
      food_catalog_generation_names: [query({
        data: [
          { food_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name_fact_id: nameA },
          { food_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name_fact_id: nameB },
        ],
        error: null,
      })],
      food_nutrition_revisions: [query({
        data: [{ id: nutritionId, calories: 100, protein_g: 10, carbs_g: 20, fat_g: 5 }],
        error: null,
      })],
      food_names: [query({
        data: [
          { id: nameA, language_tag: "en", normalized_text: "greek yogurt", name_text: "Greek yogurt" },
          { id: nameB, language_tag: "en", normalized_text: "greek yogurt", name_text: "Greek yoghurt" },
        ],
        error: null,
      })],
    });

    const quality = await getCurrentGenerationQuality(db.supabase);

    expect(quality).toEqual({
      available: true,
      generationId,
      activeFoodCount: 2,
      foodsMissingMacros: 1,
      duplicateSelectedNames: 1,
    });
    expect(db.from).not.toHaveBeenCalledWith("food_items");
  });

  it("counts NULL macro fields as unknown rather than zero", async () => {
    const generationId = "11111111-1111-4111-8111-111111111111";
    const nutritionId = "22222222-2222-4222-8222-222222222222";
    const db = client({
      food_catalog_current_generation: [query({ data: { current_generation_id: generationId }, error: null })],
      food_catalog_generation_foods: [query({
        data: [{ food_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nutrition_revision_id: nutritionId, lifecycle: "active" }],
        error: null,
      })],
      food_catalog_generation_names: [query({ data: [], error: null })],
      food_nutrition_revisions: [query({
        data: [{ id: nutritionId, calories: 0, protein_g: null, carbs_g: 0, fat_g: 0 }],
        error: null,
      })],
    });

    const quality = await getCurrentGenerationQuality(db.supabase);

    expect(quality.foodsMissingMacros).toBe(1);
  });
});
