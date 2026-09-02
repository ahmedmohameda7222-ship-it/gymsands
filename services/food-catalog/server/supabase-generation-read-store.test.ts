import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFoodCatalogGenerationReadStore } from "./supabase-generation-read-store";

const GENERATION_ID = "41000000-0000-4000-8000-000000000001";
const FOOD_ID = "42000000-0000-4000-8000-000000000001";
const SERVING_ID = "43000000-0000-4000-8000-000000000001";
const NAME_ID = "44000000-0000-4000-8000-000000000001";
const TAXONOMY_ID = "45000000-0000-4000-8000-000000000001";
const MARKET_ID = "46000000-0000-4000-8000-000000000001";
const ASSERTION_ID = "47000000-0000-4000-8000-000000000001";

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
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => response);
    query.single = vi.fn(async () => response);
    (queries[table] ??= []).push(query);
    return query;
  });
  return { supabase: { from } as unknown as SupabaseClient, queries, from };
}

function generationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GENERATION_ID,
    base_generation_id: null,
    generation_ordinal: 1,
    composition_schema_version: "composition-v1",
    generation_policy_version: "generation-v1",
    activation_policy_version: "activation-v1",
    trust_policy_version: "trust-v1",
    projection_version: "projection-v1",
    change_manifest_checksum_sha256: "a".repeat(64),
    composition_checksum_sha256: "b".repeat(64),
    authority_reference: "fixture",
    created_at: "2026-09-02T00:00:00.000Z",
    sealed_at: "2026-09-02T00:00:01.000Z",
    ...overrides,
  };
}

describe("Food Catalog Plan 3 Supabase generation read store", () => {
  it("reads the singleton pointer by exact singleton predicate without ordering", async () => {
    const { supabase, queries } = makeSupabase({
      food_catalog_current_generation: {
        data: {
          current_generation_id: GENERATION_ID,
          current_event_id: "48000000-0000-4000-8000-000000000001",
          current_validation_report_id: "49000000-0000-4000-8000-000000000001",
          pointer_revision: 4,
        },
        error: null,
      },
    });
    const store = createSupabaseFoodCatalogGenerationReadStore(supabase);

    await expect(store.readCurrentPointer()).resolves.toEqual({
      currentGenerationId: GENERATION_ID,
      currentEventId: "48000000-0000-4000-8000-000000000001",
      currentValidationReportId: "49000000-0000-4000-8000-000000000001",
      pointerRevision: 4,
    });
    expect(queries.food_catalog_current_generation[0].eq).toHaveBeenCalledWith("singleton_key", true);
    expect(queries.food_catalog_current_generation[0].order).not.toHaveBeenCalled();
  });

  it("reads exact generation and exact generation Food identities without latest-row heuristics", async () => {
    const { supabase, queries } = makeSupabase({
      food_catalog_generations: { data: generationRow(), error: null },
      food_catalog_generation_foods: {
        data: {
          generation_id: GENERATION_ID,
          food_id: FOOD_ID,
          lifecycle: "active",
          nutrition_revision_id: null,
          activation_set_id: "4a000000-0000-4000-8000-000000000001",
          activation_set_member_id: "4b000000-0000-4000-8000-000000000001",
          activation_grant_event_id: "4c000000-0000-4000-8000-000000000001",
        },
        error: null,
      },
    });
    const store = createSupabaseFoodCatalogGenerationReadStore(supabase);

    await expect(store.readGeneration(GENERATION_ID)).resolves.toEqual(expect.objectContaining({ id: GENERATION_ID }));
    await expect(store.readGenerationFood(GENERATION_ID, FOOD_ID)).resolves.toEqual(expect.objectContaining({
      generationId: GENERATION_ID,
      foodId: FOOD_ID,
      lifecycle: "active",
    }));
    expect(queries.food_catalog_generations[0].eq).toHaveBeenCalledWith("id", GENERATION_ID);
    expect(queries.food_catalog_generations[0].order).not.toHaveBeenCalled();
    expect(queries.food_catalog_generation_foods[0].eq).toHaveBeenCalledWith("generation_id", GENERATION_ID);
    expect(queries.food_catalog_generation_foods[0].eq).toHaveBeenCalledWith("food_id", FOOD_ID);
    expect(queries.food_catalog_generation_foods[0].order).not.toHaveBeenCalled();
  });

  it("rejects malformed persisted lifecycle, checksum, and count values instead of coercing them", async () => {
    const badGeneration = makeSupabase({
      food_catalog_generations: { data: generationRow({ composition_checksum_sha256: "bad" }), error: null },
    });
    await expect(createSupabaseFoodCatalogGenerationReadStore(badGeneration.supabase).readGeneration(GENERATION_ID))
      .rejects.toThrow(/checksum/i);

    const badFood = makeSupabase({
      food_catalog_generation_foods: {
        data: {
          generation_id: GENERATION_ID,
          food_id: FOOD_ID,
          lifecycle: "draft",
          nutrition_revision_id: null,
          activation_set_id: null,
          activation_set_member_id: null,
          activation_grant_event_id: null,
        },
        error: null,
      },
    });
    await expect(createSupabaseFoodCatalogGenerationReadStore(badFood.supabase).readGenerationFood(GENERATION_ID, FOOD_ID))
      .rejects.toThrow(/lifecycle/i);

    const badPointer = makeSupabase({
      food_catalog_current_generation: {
        data: { current_generation_id: null, current_event_id: null, current_validation_report_id: null, pointer_revision: -1 },
        error: null,
      },
    });
    await expect(createSupabaseFoodCatalogGenerationReadStore(badPointer.supabase).readCurrentPointer())
      .rejects.toThrow(/pointer_revision/i);
  });

  it("hydrates selected facts only by both Food identity and the explicit selected IDs", async () => {
    const { supabase, queries } = makeSupabase({
      food_serving_options: { data: [], error: null },
      food_names: { data: [], error: null },
      food_taxonomy_assignments: { data: [], error: null },
      food_market_assignments: { data: [], error: null },
      food_verification_assertions: {
        data: [{
          id: ASSERTION_ID,
          food_id: FOOD_ID,
          assertion_scope: "identity",
          assertion_state: "verified",
          policy_version: "verification-v1",
          source_record_id: null,
          supersedes_assertion_id: null,
          reason_code: "fixture",
          authority_reference: "fixture-authority",
          created_at: "2026-09-02T00:00:00.000Z",
        }],
        error: null,
      },
    });
    const store = createSupabaseFoodCatalogGenerationReadStore(supabase);

    await store.readServingOptions(FOOD_ID, [SERVING_ID]);
    await store.readNames(FOOD_ID, [NAME_ID]);
    await store.readTaxonomyAssignments(FOOD_ID, [TAXONOMY_ID]);
    await store.readMarketAssignments(FOOD_ID, [MARKET_ID]);
    await store.readVerificationAssertions(FOOD_ID, [{ scope: "identity", assertionId: ASSERTION_ID }]);

    for (const table of ["food_serving_options", "food_names", "food_taxonomy_assignments", "food_market_assignments", "food_verification_assertions"]) {
      expect(queries[table][0].eq).toHaveBeenCalledWith("food_id", FOOD_ID);
    }
    expect(queries.food_serving_options[0].in).toHaveBeenCalledWith("id", [SERVING_ID]);
    expect(queries.food_names[0].in).toHaveBeenCalledWith("id", [NAME_ID]);
    expect(queries.food_taxonomy_assignments[0].in).toHaveBeenCalledWith("id", [TAXONOMY_ID]);
    expect(queries.food_market_assignments[0].in).toHaveBeenCalledWith("id", [MARKET_ID]);
    expect(queries.food_verification_assertions[0].in).toHaveBeenCalledWith("id", [ASSERTION_ID]);
  });

  it("returns empty selected-fact arrays without issuing empty IN queries", async () => {
    const { supabase, from } = makeSupabase({});
    const store = createSupabaseFoodCatalogGenerationReadStore(supabase);

    await expect(store.readServingOptions(FOOD_ID, [])).resolves.toEqual([]);
    await expect(store.readNames(FOOD_ID, [])).resolves.toEqual([]);
    await expect(store.readTaxonomyAssignments(FOOD_ID, [])).resolves.toEqual([]);
    await expect(store.readMarketAssignments(FOOD_ID, [])).resolves.toEqual([]);
    await expect(store.readVerificationAssertions(FOOD_ID, [])).resolves.toEqual([]);

    expect(from).not.toHaveBeenCalled();
  });
});
