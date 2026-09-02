import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFoodCatalogWriteStore } from "./supabase-write-store";

const FOOD_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_FOOD_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_ID = "44444444-4444-4444-8444-444444444444";

function makeSupabase(errorByTable: Record<string, { message: string } | null> = {}) {
  const inserts: Record<string, ReturnType<typeof vi.fn>> = {};
  const update = vi.fn(() => { throw new Error("update must not be used"); });
  const remove = vi.fn(() => { throw new Error("delete must not be used"); });
  const upsert = vi.fn(() => { throw new Error("upsert must not be used"); });
  const from = vi.fn((table: string) => {
    const insert = vi.fn(async () => ({ error: errorByTable[table] ?? null }));
    inserts[table] = insert;
    return { insert, update, delete: remove, upsert };
  });
  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    inserts,
    update,
    remove,
    upsert,
  };
}

describe("Food Catalog V2 Supabase write store", () => {
  it("validates nutrition before any database access", async () => {
    const { supabase, from } = makeSupabase();
    const store = createSupabaseFoodCatalogWriteStore(supabase);

    await expect(store.appendNutritionRevision({
      foodId: FOOD_ID,
      revisionNumber: 1,
      calories: -1,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basisAmount: 100,
      basisUnit: "g",
      nutrientMappingVersion: "test-v1",
      sourceRecordId: null,
    })).rejects.toThrow(/non-negative/i);

    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a source-less household serving before any database access", async () => {
    const { supabase, from } = makeSupabase();
    const store = createSupabaseFoodCatalogWriteStore(supabase);

    await expect(store.appendServingOption({
      foodId: FOOD_ID,
      label: "1 cup",
      amount: 1,
      unitCode: "cup",
      gramWeight: 240,
      sourceRecordId: null,
      sourcePortionCode: "cup",
      evidenceClass: "exact_source",
      sourcePrimary: false,
    })).rejects.toThrow(/source-backed provenance/i);

    expect(from).not.toHaveBeenCalled();
  });

  it("uses insert-only persistence for all seven immutable fact APIs", async () => {
    const { supabase, from, inserts, update, remove, upsert } = makeSupabase();
    const store = createSupabaseFoodCatalogWriteStore(supabase);

    await store.appendNutritionRevision({
      foodId: FOOD_ID,
      revisionNumber: 1,
      calories: 0,
      protein_g: null,
      carbs_g: 5,
      fat_g: 1,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: 2,
      basisAmount: 100,
      basisUnit: "g",
      nutrientMappingVersion: "map-v1",
      sourceRecordId: SOURCE_ID,
    });
    await store.appendServingOption({
      foodId: FOOD_ID,
      label: "100 g",
      amount: 100,
      unitCode: "g",
      gramWeight: null,
      sourceRecordId: null,
      sourcePortionCode: null,
      evidenceClass: "exact_source",
      sourcePrimary: false,
    });
    await store.appendName({
      foodId: FOOD_ID,
      languageTag: "en",
      role: "preferred_display",
      text: "Test Food",
      normalizedText: "test food",
      scriptCode: "Latn",
      origin: "curated",
      sourceRecordId: null,
      policyVersion: "name-v1",
    });
    await store.appendTaxonomyAssignment({
      foodId: FOOD_ID,
      nodeCode: "protein_foods",
      sourceRecordId: null,
      action: "assign",
      policyVersion: "taxonomy-v1",
    });
    await store.appendMarketAssignment({
      foodId: FOOD_ID,
      scopeCode: "DE",
      relevance: "primary",
      sourceRecordId: null,
      action: "assign",
      policyVersion: "market-v1",
    });
    await store.appendVerificationAssertion({
      foodId: FOOD_ID,
      scope: "nutrition",
      state: "verified",
      policyVersion: "verify-v1",
      sourceRecordId: SOURCE_ID,
      supersedesAssertionId: null,
      reasonCode: "source_review",
      authorityReference: "planner:test",
    });
    await store.appendMergeEvent({
      sourceFoodId: FOOD_ID,
      targetFoodId: OTHER_FOOD_ID,
      policyVersion: "merge-v1",
      reasonCode: "duplicate",
      evidenceReference: "evidence:test",
      authorityReference: "planner:test",
    });

    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "food_nutrition_revisions",
      "food_serving_options",
      "food_names",
      "food_taxonomy_assignments",
      "food_market_assignments",
      "food_verification_assertions",
      "food_merge_events",
    ]);
    expect(inserts.food_nutrition_revisions).toHaveBeenCalledWith({
      food_id: FOOD_ID,
      revision_number: 1,
      calories: 0,
      protein_g: null,
      carbs_g: 5,
      fat_g: 1,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: 2,
      basis_amount: 100,
      basis_unit: "g",
      nutrient_mapping_version: "map-v1",
      source_record_id: SOURCE_ID,
    });
    expect(inserts.food_serving_options).toHaveBeenCalledWith({
      food_id: FOOD_ID,
      label: "100 g",
      amount: 100,
      unit_code: "g",
      gram_weight: null,
      source_record_id: null,
      source_portion_code: null,
      evidence_class: "exact_source",
      source_primary: false,
    });
    expect(inserts.food_names).toHaveBeenCalledWith({
      food_id: FOOD_ID,
      language_tag: "en",
      name_role: "preferred_display",
      name_text: "Test Food",
      normalized_text: "test food",
      script_code: "Latn",
      origin: "curated",
      source_record_id: null,
      policy_version: "name-v1",
    });
    expect(inserts.food_taxonomy_assignments).toHaveBeenCalledWith({
      food_id: FOOD_ID,
      node_code: "protein_foods",
      source_record_id: null,
      assignment_action: "assign",
      policy_version: "taxonomy-v1",
    });
    expect(inserts.food_market_assignments).toHaveBeenCalledWith({
      food_id: FOOD_ID,
      scope_code: "DE",
      relevance_level: "primary",
      source_record_id: null,
      assignment_action: "assign",
      policy_version: "market-v1",
    });
    expect(inserts.food_verification_assertions).toHaveBeenCalledWith({
      food_id: FOOD_ID,
      assertion_scope: "nutrition",
      assertion_state: "verified",
      policy_version: "verify-v1",
      source_record_id: SOURCE_ID,
      supersedes_assertion_id: null,
      reason_code: "source_review",
      authority_reference: "planner:test",
    });
    expect(inserts.food_merge_events).toHaveBeenCalledWith({
      source_food_id: FOOD_ID,
      target_food_id: OTHER_FOOD_ID,
      policy_version: "merge-v1",
      reason_code: "duplicate",
      evidence_reference: "evidence:test",
      authority_reference: "planner:test",
    });
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("surfaces database insertion errors through the V2 write boundary", async () => {
    const { supabase } = makeSupabase({ food_taxonomy_assignments: { message: "constraint failed" } });
    const store = createSupabaseFoodCatalogWriteStore(supabase);

    await expect(store.appendTaxonomyAssignment({
      foodId: FOOD_ID,
      nodeCode: "protein_foods",
      sourceRecordId: null,
      action: "assign",
      policyVersion: "taxonomy-v1",
    })).rejects.toThrow(/Food Catalog V2 write.*constraint failed/i);
  });
});
