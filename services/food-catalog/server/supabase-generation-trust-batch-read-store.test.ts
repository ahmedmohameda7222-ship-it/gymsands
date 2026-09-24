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

function id(prefix: string, index: number) {
  return `${prefix}0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function generationFoodRow(foodId: string, index: number) {
  return {
    generation_id: GENERATION_ID,
    food_id: foodId,
    lifecycle: "active",
    nutrition_revision_id: id("73", index),
    activation_set_id: id("74", index),
    activation_set_member_id: id("75", index),
    activation_grant_event_id: id("76", index),
  };
}

describe("Plan 7 targeted Supabase Recipe trust batching", () => {
  it("loads 20 generation Foods and redirects with generation-scoped IN queries, never an unrestricted generation scan", async () => {
    const foodRows = ids.map(generationFoodRow);
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

  it("hydrates selected verification facts and sealed activation authority in bounded table families for 20 Foods", async () => {
    const foods = ids.map((foodId, index): StoredGenerationFood => ({
      generationId: GENERATION_ID,
      foodId,
      lifecycle: "active",
      nutritionRevisionId: id("73", index),
      activationSetId: id("74", index),
      activationSetMemberId: id("75", index),
      activationGrantEventId: id("76", index),
    }));
    const servingIds = ids.map((_foodId, index) => id("77", index));
    const nameIds = ids.map((_foodId, index) => id("78", index));
    const identityIds = ids.map((_foodId, index) => id("79", index));
    const nutritionAssertionIds = ids.map((_foodId, index) => id("7a", index));

    const { supabase, queries } = makeSupabase({
      food_catalog_generation_servings: {
        data: ids.map((foodId, index) => ({ food_id: foodId, serving_option_id: servingIds[index] })),
        error: null,
      },
      food_catalog_generation_names: {
        data: ids.map((foodId, index) => ({ food_id: foodId, name_fact_id: nameIds[index] })),
        error: null,
      },
      food_catalog_generation_taxonomy: { data: [], error: null },
      food_catalog_generation_markets: { data: [], error: null },
      food_catalog_generation_verification: {
        data: ids.flatMap((foodId, index) => [
          { food_id: foodId, assertion_scope: "identity", assertion_id: identityIds[index] },
          { food_id: foodId, assertion_scope: "nutrition", assertion_id: nutritionAssertionIds[index] },
        ]),
        error: null,
      },
      food_nutrition_revisions: {
        data: ids.map((foodId, index) => ({
          id: id("73", index),
          food_id: foodId,
          revision_number: 1,
          calories: 100,
          protein_g: 10,
          carbs_g: 12,
          fat_g: 2,
          saturated_fat_g: null,
          fiber_g: 3,
          sugars_g: null,
          sodium_mg: null,
          basis_amount: 100,
          basis_unit: "g",
          nutrient_mapping_version: "map-v1",
          source_record_id: null,
          created_at: "2026-09-02T09:00:00.000Z",
        })),
        error: null,
      },
      food_serving_options: {
        data: ids.map((foodId, index) => ({
          id: servingIds[index],
          food_id: foodId,
          label: "1 bowl",
          amount: 1,
          unit_code: "bowl",
          gram_weight: 100,
          source_record_id: `serving-source-${index + 1}`,
          source_portion_code: null,
          evidence_class: "exact_source",
          source_primary: true,
          created_at: "2026-09-02T09:00:00.000Z",
        })),
        error: null,
      },
      food_names: {
        data: ids.map((foodId, index) => ({
          id: nameIds[index],
          food_id: foodId,
          language_tag: "en",
          name_role: "preferred_display",
          name_text: `Food ${index + 1}`,
          normalized_text: `food ${index + 1}`,
          script_code: "Latn",
          origin: "curated",
          source_record_id: null,
          policy_version: "name-v1",
          created_at: "2026-09-02T09:00:00.000Z",
        })),
        error: null,
      },
      food_taxonomy_assignments: { data: [], error: null },
      food_market_assignments: { data: [], error: null },
      food_verification_assertions: {
        data: ids.flatMap((foodId, index) => [
          {
            id: identityIds[index],
            food_id: foodId,
            assertion_scope: "identity",
            assertion_state: "verified",
            policy_version: "verification-v1",
            source_record_id: null,
            supersedes_assertion_id: null,
            reason_code: "selected",
            authority_reference: "fixture",
            created_at: "2026-09-02T09:00:00.000Z",
          },
          {
            id: nutritionAssertionIds[index],
            food_id: foodId,
            assertion_scope: "nutrition",
            assertion_state: "verified",
            policy_version: "verification-v1",
            source_record_id: null,
            supersedes_assertion_id: null,
            reason_code: "selected",
            authority_reference: "fixture",
            created_at: "2026-09-02T09:00:00.000Z",
          },
        ]),
        error: null,
      },
      food_catalog_activation_set_members: {
        data: ids.map((foodId, index) => ({
          id: id("75", index),
          activation_set_id: id("74", index),
          food_id: foodId,
          eligibility: "eligible",
          source_legal_accepted: true,
        })),
        error: null,
      },
      food_catalog_activation_sets: {
        data: ids.map((_foodId, index) => ({
          id: id("74", index),
          activation_policy_version: "activation-v1",
        })),
        error: null,
      },
      food_catalog_activation_events: [
        {
          data: ids.map((_foodId, index) => ({
            id: id("76", index),
            activation_set_id: id("74", index),
            event_type: "grant",
            created_at: "2026-09-02T09:30:00.000Z",
          })),
          error: null,
        },
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

    for (const table of [
      "food_nutrition_revisions",
      "food_serving_options",
      "food_names",
      "food_verification_assertions",
      "food_catalog_activation_set_members",
      "food_catalog_activation_sets",
    ]) {
      expect(queries[table]).toHaveLength(1);
    }
    expect(queries.food_verification_assertions[0]!.in).toHaveBeenCalledWith(
      "id",
      ids.flatMap((_foodId, index) => [identityIds[index]!, nutritionAssertionIds[index]!]),
    );
    expect(queries.food_catalog_activation_set_members[0]!.in).toHaveBeenCalledWith(
      "id",
      foods.map((food) => food.activationSetMemberId),
    );
    expect(queries.food_catalog_activation_sets[0]!.in).toHaveBeenCalledWith(
      "id",
      foods.map((food) => food.activationSetId),
    );
    expect(queries.food_catalog_activation_events).toHaveLength(2);
    expect(queries.food_catalog_activation_events[0]!.in).toHaveBeenCalledWith(
      "id",
      foods.map((food) => food.activationGrantEventId),
    );
    expect(queries.food_catalog_activation_events[1]!.eq).toHaveBeenCalledWith("event_type", "invalidate");
    expect(queries.food_catalog_activation_events[1]!.in).toHaveBeenCalledWith(
      "target_grant_event_id",
      foods.map((food) => food.activationGrantEventId),
    );
  });

  it("chunks large targeted Food batches at the fixed safe bound rather than enumerating the generation", async () => {
    const manyIds = Array.from({ length: 205 }, (_, index) => `7b000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    const responses = [
      manyIds.slice(0, 100),
      manyIds.slice(100, 200),
      manyIds.slice(200),
    ].map((batch, batchIndex) => ({
      data: batch.map((foodId, index) => ({
        generation_id: GENERATION_ID,
        food_id: foodId,
        lifecycle: "deprecated",
        nutrition_revision_id: null,
        activation_set_id: null,
        activation_set_member_id: null,
        activation_grant_event_id: null,
      })),
      error: null,
    }));
    const { supabase, queries } = makeSupabase({ food_catalog_generation_foods: responses });
    const store = createSupabaseFoodCatalogGenerationReadStore(supabase) as unknown as {
      readGenerationFoodsByIds?: (generationId: string, foodIds: readonly string[]) => Promise<StoredGenerationFood[]>;
    };

    await store.readGenerationFoodsByIds!(GENERATION_ID, manyIds);

    expect(queries.food_catalog_generation_foods).toHaveLength(3);
    expect(queries.food_catalog_generation_foods.map((query) => query.in.mock.calls[0]?.[1].length)).toEqual([100, 100, 5]);
    for (const query of queries.food_catalog_generation_foods) {
      expect(query.eq).toHaveBeenCalledWith("generation_id", GENERATION_ID);
      expect(query.limit).not.toHaveBeenCalled();
    }
  });
});
