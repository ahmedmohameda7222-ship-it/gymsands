import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFoodCatalogReadStore } from "./supabase-read-store";

const FOOD_ID = "22222222-2222-4222-8222-222222222222";

type QueryResponse = { data: unknown; error: null | { message: string } };

function makeSupabase(rowsByTable: Record<string, unknown>) {
  const queries: Record<string, Array<Record<string, ReturnType<typeof vi.fn>>>> = {};
  const from = vi.fn((table: string) => {
    const response = rowsByTable[table] as QueryResponse | undefined ?? { data: [], error: null };
    const query: Record<string, ReturnType<typeof vi.fn>> & PromiseLike<QueryResponse> = {
      then: ((resolve: (value: QueryResponse) => unknown) => Promise.resolve(response).then(resolve)) as PromiseLike<QueryResponse>["then"],
    } as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<QueryResponse>;
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.or = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => response);
    (queries[table] ??= []).push(query);
    return query;
  });
  return { supabase: { from } as unknown as SupabaseClient, queries, from };
}

function nameRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    food_id: FOOD_ID,
    language_tag: "en",
    name_role: "synonym",
    name_text: "Test Food",
    normalized_text: "test food",
    script_code: "Latn",
    origin: "curated",
    source_record_id: null,
    policy_version: "name-v1",
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Food Catalog V2 Supabase read store", () => {
  it("reads only compatibility identity/lifecycle fields from the Food root", async () => {
    const { supabase, queries } = makeSupabase({
      food_items: { data: { id: FOOD_ID, lifecycle_status: "active", merged_into_food_id: null }, error: null },
    });
    const store = createSupabaseFoodCatalogReadStore(supabase);

    await expect(store.readRoot(FOOD_ID)).resolves.toEqual({
      id: FOOD_ID,
      lifecycleStatus: "active",
      mergedIntoFoodId: null,
    });
    expect(queries.food_items[0].select).toHaveBeenCalledWith("id,lifecycle_status,merged_into_food_id");
  });

  it("preserves explicit zero and unknown null in nutrition revisions", async () => {
    const { supabase } = makeSupabase({
      food_nutrition_revisions: {
        data: [{
          id: "33333333-3333-4333-8333-333333333333",
          food_id: FOOD_ID,
          revision_number: 1,
          calories: 0,
          protein_g: null,
          carbs_g: 0,
          fat_g: null,
          saturated_fat_g: null,
          fiber_g: null,
          sugars_g: null,
          sodium_mg: null,
          basis_amount: 100,
          basis_unit: "g",
          nutrient_mapping_version: "map-v1",
          source_record_id: null,
          created_at: "2026-09-01T00:00:00.000Z",
        }],
        error: null,
      },
    });
    const store = createSupabaseFoodCatalogReadStore(supabase);

    await expect(store.readNutritionRevisions(FOOD_ID)).resolves.toEqual([
      expect.objectContaining({ calories: 0, protein_g: null, basisAmount: 100, basisUnit: "g" }),
    ]);
  });

  it("rejects invalid persisted lifecycle and nutrition instead of coercing them", async () => {
    const root = makeSupabase({
      food_items: { data: { id: FOOD_ID, lifecycle_status: "invalid", merged_into_food_id: null }, error: null },
    });
    await expect(createSupabaseFoodCatalogReadStore(root.supabase).readRoot(FOOD_ID)).rejects.toThrow(/Food Catalog V2 read.*lifecycle/i);

    const nutrition = makeSupabase({
      food_nutrition_revisions: {
        data: [{
          id: "33333333-3333-4333-8333-333333333333",
          food_id: FOOD_ID,
          revision_number: 1,
          calories: -1,
          protein_g: null,
          carbs_g: null,
          fat_g: null,
          saturated_fat_g: null,
          fiber_g: null,
          sugars_g: null,
          sodium_mg: null,
          basis_amount: 100,
          basis_unit: "g",
          nutrient_mapping_version: "map-v1",
          source_record_id: null,
          created_at: "2026-09-01T00:00:00.000Z",
        }],
        error: null,
      },
    });
    await expect(createSupabaseFoodCatalogReadStore(nutrition.supabase).readNutritionRevisions(FOOD_ID)).rejects.toThrow(/Food Catalog V2 read.*non-negative/i);
  });

  it("rejects a persisted Food name with an invalid name_role", async () => {
    const { supabase } = makeSupabase({
      food_names: { data: [nameRow({ name_role: "invalid_role" })], error: null },
    });

    await expect(createSupabaseFoodCatalogReadStore(supabase).readNames(FOOD_ID))
      .rejects.toThrow(/Food Catalog V2 read.*role/i);
  });

  it("rejects a persisted Food name with an invalid origin", async () => {
    const { supabase } = makeSupabase({
      food_names: { data: [nameRow({ origin: "invalid_origin" })], error: null },
    });

    await expect(createSupabaseFoodCatalogReadStore(supabase).readNames(FOOD_ID))
      .rejects.toThrow(/Food Catalog V2 read.*origin/i);
  });

  it("reads merge events where the Food is source or target with deterministic transport ordering", async () => {
    const { supabase, queries } = makeSupabase({ food_merge_events: { data: [], error: null } });
    const store = createSupabaseFoodCatalogReadStore(supabase);

    await store.readMergeEvents(FOOD_ID);

    expect(queries.food_merge_events[0].or).toHaveBeenCalledWith(
      `source_food_id.eq.${FOOD_ID},target_food_id.eq.${FOOD_ID}`,
    );
    expect(queries.food_merge_events[0].order).toHaveBeenNthCalledWith(1, "created_at", { ascending: true });
    expect(queries.food_merge_events[0].order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });
});
