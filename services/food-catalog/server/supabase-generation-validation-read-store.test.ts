import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFoodCatalogGenerationValidationReadStore } from "./supabase-generation-validation-read-store";

const GENERATION_ID = "51000000-0000-4000-8000-000000000001";
const REDIRECT_TARGET_ID = "52000000-0000-4000-8000-000000000001";
const PAGE_SIZE = 1000;

type QueryResponse = { data: unknown; error: null | { message: string } };
type Query = Record<string, ReturnType<typeof vi.fn>> & PromiseLike<QueryResponse>;

type TableRows = Record<string, unknown>[];

function uuidFor(prefix: string, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function foodRows(count: number): TableRows {
  return Array.from({ length: count }, (_, index) => ({
    generation_id: GENERATION_ID,
    food_id: uuidFor("53", index + 1),
    lifecycle: "deprecated",
    nutrition_revision_id: null,
    activation_set_id: null,
    activation_set_member_id: null,
    activation_grant_event_id: null,
  }));
}

function redirectRows(count: number): TableRows {
  return Array.from({ length: count }, (_, index) => ({
    generation_id: GENERATION_ID,
    source_food_id: uuidFor("54", index + 1),
    target_food_id: REDIRECT_TARGET_ID,
  }));
}

function makePagedSupabase(rowsByTable: Record<string, TableRows>) {
  const queries: Record<string, Query[]> = {};
  const from = vi.fn((table: string) => {
    const allRows = rowsByTable[table] ?? [];
    let range: [number, number] | null = null;
    const response = () => {
      const selected = range === null
        ? allRows.slice(0, PAGE_SIZE)
        : allRows.slice(range[0], range[1] + 1);
      return { data: selected, error: null } satisfies QueryResponse;
    };
    const query = {
      then: ((resolve: (value: QueryResponse) => unknown) => Promise.resolve(response()).then(resolve)) as PromiseLike<QueryResponse>["then"],
    } as Query;
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.range = vi.fn((fromIndex: number, toIndex: number) => {
      range = [fromIndex, toIndex];
      return query;
    });
    query.maybeSingle = vi.fn(async () => response());
    query.single = vi.fn(async () => response());
    (queries[table] ??= []).push(query);
    return query;
  });
  return { supabase: { from } as unknown as SupabaseClient, queries };
}

describe("Food Catalog Plan 3 validation enumeration", () => {
  it("enumerates every generation Food across deterministic Data API pages", async () => {
    const expected = foodRows(1002);
    const { supabase, queries } = makePagedSupabase({
      food_catalog_generation_foods: expected,
    });
    const store = createSupabaseFoodCatalogGenerationValidationReadStore(supabase);

    const actual = await store.readGenerationFoods(GENERATION_ID);

    expect(actual).toHaveLength(1002);
    expect(actual.map((row) => row.foodId)).toEqual(expected.map((row) => row.food_id));
    expect(queries.food_catalog_generation_foods).toHaveLength(2);
    expect(queries.food_catalog_generation_foods[0].order).toHaveBeenCalledWith("food_id", { ascending: true });
    expect(queries.food_catalog_generation_foods[0].range).toHaveBeenCalledWith(0, 999);
    expect(queries.food_catalog_generation_foods[1].order).toHaveBeenCalledWith("food_id", { ascending: true });
    expect(queries.food_catalog_generation_foods[1].range).toHaveBeenCalledWith(1000, 1999);
  });

  it("enumerates every generation redirect across deterministic Data API pages", async () => {
    const expected = redirectRows(1001);
    const { supabase, queries } = makePagedSupabase({
      food_catalog_generation_redirects: expected,
    });
    const store = createSupabaseFoodCatalogGenerationValidationReadStore(supabase);

    const actual = await store.readGenerationRedirects(GENERATION_ID);

    expect(actual).toHaveLength(1001);
    expect(actual.map((row) => row.sourceFoodId)).toEqual(expected.map((row) => row.source_food_id));
    expect(queries.food_catalog_generation_redirects).toHaveLength(2);
    expect(queries.food_catalog_generation_redirects[0].order).toHaveBeenCalledWith("source_food_id", { ascending: true });
    expect(queries.food_catalog_generation_redirects[0].range).toHaveBeenCalledWith(0, 999);
    expect(queries.food_catalog_generation_redirects[1].order).toHaveBeenCalledWith("source_food_id", { ascending: true });
    expect(queries.food_catalog_generation_redirects[1].range).toHaveBeenCalledWith(1000, 1999);
  });
});
