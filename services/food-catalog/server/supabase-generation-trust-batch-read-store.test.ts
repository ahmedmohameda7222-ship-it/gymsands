import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredGenerationFood } from "./generation-contracts";
import { createSupabaseFoodCatalogGenerationReadStore } from "./supabase-generation-read-store";

type QueryResponse = { data: unknown; error: null | { message: string } };
type Query = Record<string, ReturnType<typeof vi.fn>> & PromiseLike<QueryResponse>;

function makeSupabase(rowsByTable: Record<string, QueryResponse | QueryResponse[]>) {
  const queries: Record<string, Query[]> = {};
  const from = vi.fn((table: string) => {
    const configured = rowsByTable[table];
    const index = queries[table]?.length ?? 0;
    const response = Array.isArray(configured)
      ? configured[index] ?? { data: [], error: null }
      : configured ?? { data: [], error: null };
    const query = {
      then: ((resolve: (value: QueryResponse) => unknown) => Promise.resolve(response).then(resolve)) as PromiseLike<QueryResponse>["then"],
    } as Query;
    for (const method of ["select", "eq", "in", "order", "limit"]) query[method] = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => response);
    (queries[table] ??= []).push(query);
    return query;
  });
  return { supabase: { from } as unknown as SupabaseClient, queries, from };
}

const GENERATION_ID = "71000000-0000-4000-8000-000000000001";
const ids = Array.from({ length: 20 }, (_, index) => `72000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

describe("Plan 7 targeted Supabase Recipe trust batching", () => {
  it("loads 20 generation Foods and redirects with generation-scoped IN queries, never an unrestricted generation scan", async () => {
    const foodRows = ids.map((foodId) => ({
      generation_id: GENERATION_ID,
      food_id: foodId,
      lifecycle: "active",
      nutrition_revision_id: null,
      activation_set_id: null,
      activation_set_member_id: null,
      activation_grant_event_id: null,
    }));
    const { supabase, queries } = makeSupabase({
      food_catalog_generation_foods: { data: foodRows, error: null },
      food_catalog_generation_redirects: { data: [], error: null },
    });
    const store = createSupabaseFoodCatalogGenerationReadStore(supabase) as unknown as {
      readGenerationFoodsByIds?: (generationId: string, foodIds: readonly string[]) => Promise<StoredGenerationFood[]>;
      readGenerationRedirectsBySourceIds?: (generationId: string, foodIds: readonly string[]) => Promise<unknown[]>;
    };

    expect(store.readGenerationFoodsByIds).toBeTypeOf("function");
    expect(store.readGenerationRedirectsBySourceIds).toBeTypeOf("function");
    await store.readGenerationFoodsByIds!(GENERATION_ID, ids);
    await store.readGenerationRedirectsBySourceIds!(GENERATION_ID, ids);

    expect(queries.food_catalog_generation_foods).toHaveLength(1);
    expect(queries.food_catalog_generation_foods[0]!.eq).toHaveBeenCalledWith("generation_id", GENERATION_ID);
    expect(queries.food_catalog_generation_foods[0]!.in).toHaveBeenCalledWith("food_id", ids);
    expect(queries.food_catalog_generation_foods[0]!.limit).not.toHaveBeenCalled();
    expect(queries.food_catalog_generation_redirects).toHaveLength(1);
    expect(queries.food_catalog_generation_redirects[0]!.eq).toHaveBeenCalledWith("generation_id", GENERATION_ID);
    expect(queries.food_catalog_generation_redirects[0]!.in).toHaveBeenCalledWith("source_food_id", ids);
    expect(queries.food_catalog_generation_redirects[0]!.limit).not.toHaveBeenCalled();
  });

  it("hydrates selections and trust facts in bounded table families for 20 Foods", async () => {
    const foods = ids.map((foodId, index): StoredGenerationFood => ({
      generationId: GENERATION_ID,
      foodId,
      lifecycle: "active",
      nutritionRevisionId: `73000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      activationSetId: `74000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      activationSetMemberId: `75000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      activationGrantEventId: `76000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const { supabase, queries } = makeSupabase({
      food_catalog_generation_servings: { data: [], error: null },
      food_catalog_generation_names: { data: [], error: null },
      food_catalog_generation_taxonomy: { data: [], error: null },
      food_catalog_generation_markets: { data: [], error: null },
      food_catalog_generation_verification: { data: [], error: null },
      food_nutrition_revisions: { data: [], error: null },
      food_serving_options: { data: [], error: null },
      food_names: { data: [], error: null },
      food_taxonomy_assignments: { data: [], error: null },
      food_market_assignments: { data: [], error: null },
      food_verification_assertions: { data: [], error: null },
      food_catalog_activation_set_members: { data: [], error: null },
      food_catalog_activation_sets: { data: [], error: null },
      food_catalog_activation_events: [
        { data: [], error: null },
        { data: [], error: null },
      ],
    });
    const store = createSupabaseFoodCatalogGenerationReadStore(supabase) as unknown as {
      readGenerationTrustHydration?: (generationId: string, foods: readonly StoredGenerationFood[]) => Promise<unknown>;
    };

    expect(store.readGenerationTrustHydration).toBeTypeOf("function");
    await store.readGenerationTrustHydration!(GENERATION_ID, foods);

    for (const table of [
      "food_catalog_generation_servings",
      "food_catalog_generation_names",
      "food_catalog_generation_taxonomy",
      "food_catalog_generation_markets",
      "food_catalog_generation_verification",
    ]) {
      expect(queries[table]).toHaveLength(1);
      expect(queries[table]![0]!.eq).toHaveBeenCalledWith("generation_id", GENERATION_ID);
      expect(queries[table]![0]!.in).toHaveBeenCalledWith("food_id", ids);
    }
    expect(queries.food_nutrition_revisions).toHaveLength(1);
    expect(queries.food_catalog_activation_set_members).toHaveLength(1);
    expect(queries.food_catalog_activation_set_members[0]!.in).toHaveBeenCalledWith(
      "id",
      foods.map((food) => food.activationSetMemberId),
    );
    expect(queries.food_catalog_activation_events).toHaveLength(2);
  });
});
