import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listCurrentFoodCatalogCategoryFacets } from "@/services/food-catalog/server/current-search-category-facets";

type Row = Record<string, unknown>;
type TableFixture = {
  rows: Row[];
  rangeErrorAt?: number;
};
type Query = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function compareNullableText(left: unknown, right: unknown) {
  const a = typeof left === "string" ? left : "";
  const b = typeof right === "string" ? right : "";
  return a.localeCompare(b);
}

function makeSupabase(fixtures: Record<string, TableFixture>) {
  const queries: Record<string, Query[]> = {};
  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const orders: string[] = [];
    const fixture = fixtures[table] ?? { rows: [] };
    const apply = () => {
      const filtered = fixture.rows.filter((row) => filters.every(([column, value]) => row[column] === value));
      return [...filtered].sort((left, right) => {
        for (const column of orders) {
          const compared = compareNullableText(left[column], right[column]);
          if (compared !== 0) return compared;
        }
        return 0;
      });
    };
    const query = {} as Query;
    query.select = vi.fn(() => query);
    query.eq = vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    });
    query.order = vi.fn((column: string) => {
      orders.push(column);
      return query;
    });
    query.range = vi.fn(async (start: number, end: number) => {
      if (fixture.rangeErrorAt === start) return { data: null, error: { message: "forced page failure" } };
      return { data: apply().slice(start, end + 1), error: null };
    });
    query.maybeSingle = vi.fn(async () => {
      const rows = apply();
      return { data: rows[0] ?? null, error: null };
    });
    (queries[table] ??= []).push(query);
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, from, queries };
}

const G1 = "11111111-1111-4111-8111-111111111111";
const G2 = "22222222-2222-4222-8222-222222222222";

function doc(index: number, category: unknown, overrides: Partial<Row> = {}): Row {
  return {
    generation_id: G2,
    projection_version: "P2",
    category_code: category,
    food_id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    language_tag: "en",
    script_code: "",
    ...overrides,
  };
}

function currentFixtures(documents: Row[], generation: Row = { id: G2, projection_version: "P2" }): Record<string, TableFixture> {
  return {
    food_catalog_current_generation: { rows: [{ singleton_key: true, current_generation_id: G2 }] },
    food_catalog_generations: { rows: [generation] },
    food_catalog_search_documents: { rows: documents },
  };
}

describe("Plan 7 current Food Catalog search category facets", () => {
  it("continues beyond the first 1000 SearchDocuments without a hidden fixed-page cap", async () => {
    const rows = [
      ...Array.from({ length: 1000 }, (_, index) => doc(index + 1, "common")),
      doc(1001, "second-page"),
    ];
    const db = makeSupabase(currentFixtures(rows));

    await expect(listCurrentFoodCatalogCategoryFacets(db.client)).resolves.toEqual(["common", "second-page"]);

    const documentQueries = db.queries.food_catalog_search_documents;
    expect(documentQueries).toHaveLength(2);
    expect(documentQueries[0]!.range).toHaveBeenCalledWith(0, 999);
    expect(documentQueries[1]!.range).toHaveBeenCalledWith(1000, 1999);
  });

  it("binds facets to the exact current generation and its exact projection version", async () => {
    const rows = [
      doc(1, "current"),
      doc(2, "stale", { generation_id: G1, projection_version: "P1" }),
      doc(3, "old-projection", { generation_id: G2, projection_version: "P1" }),
    ];
    const db = makeSupabase(currentFixtures(rows));

    await expect(listCurrentFoodCatalogCategoryFacets(db.client)).resolves.toEqual(["current"]);

    const query = db.queries.food_catalog_search_documents[0]!;
    expect(query.eq).toHaveBeenCalledWith("generation_id", G2);
    expect(query.eq).toHaveBeenCalledWith("projection_version", "P2");
  });

  it("returns an empty facet list for a valid NULL current-generation pointer without scanning SearchDocuments", async () => {
    const db = makeSupabase({
      food_catalog_current_generation: { rows: [{ singleton_key: true, current_generation_id: null }] },
      food_catalog_generations: { rows: [{ id: G2, projection_version: "P2" }] },
      food_catalog_search_documents: { rows: [doc(1, "must-not-read")] },
    });

    await expect(listCurrentFoodCatalogCategoryFacets(db.client)).resolves.toEqual([]);
    expect(db.from).not.toHaveBeenCalledWith("food_catalog_generations");
    expect(db.from).not.toHaveBeenCalledWith("food_catalog_search_documents");
  });

  it("deduplicates category facets across localized SearchDocuments for the same Food", async () => {
    const sameFood = "40000000-0000-4000-8000-000000000001";
    const db = makeSupabase(currentFixtures([
      doc(1, "fruit", { food_id: sameFood, language_tag: "en" }),
      doc(2, "fruit", { food_id: sameFood, language_tag: "de" }),
      doc(3, "fruit", { language_tag: "ar" }),
      doc(4, "dairy"),
    ]));

    await expect(listCurrentFoodCatalogCategoryFacets(db.client)).resolves.toEqual(["dairy", "fruit"]);
  });

  it("trims, removes blank/null facets, deduplicates exact stored codes, and sorts deterministically", async () => {
    const db = makeSupabase(currentFixtures([
      doc(1, "fruit"),
      doc(2, null),
      doc(3, "protein"),
      doc(4, "fruit"),
      doc(5, "  dairy  "),
      doc(6, ""),
      doc(7, "   "),
      doc(8, " protein "),
    ]));

    await expect(listCurrentFoodCatalogCategoryFacets(db.client)).resolves.toEqual(["dairy", "fruit", "protein"]);
  });

  it("fails closed when the current-generation singleton row is missing", async () => {
    const db = makeSupabase({
      food_catalog_current_generation: { rows: [] },
      food_catalog_generations: { rows: [] },
      food_catalog_search_documents: { rows: [] },
    });

    await expect(listCurrentFoodCatalogCategoryFacets(db.client)).rejects.toThrow(/current generation/i);
  });

  it.each([
    [{ id: G1, projection_version: "P2" }, "generation"],
    [{ id: G2, projection_version: "   " }, "projection"],
  ])("fails closed for malformed current generation authority %#", async (generation, expected) => {
    const db = makeSupabase(currentFixtures([], generation));

    await expect(listCurrentFoodCatalogCategoryFacets(db.client)).rejects.toThrow(new RegExp(expected, "i"));
  });

  it("throws instead of returning a partial facet set when a later page fails", async () => {
    const fixtures = currentFixtures(Array.from({ length: 1001 }, (_, index) => doc(index + 1, index === 1000 ? "late" : "common")));
    fixtures.food_catalog_search_documents.rangeErrorAt = 1000;
    const db = makeSupabase(fixtures);

    await expect(listCurrentFoodCatalogCategoryFacets(db.client)).rejects.toThrow(/category facet/i);
  });

  it("uses deterministic SearchDocument ordering before range pagination", async () => {
    const db = makeSupabase(currentFixtures([doc(1, "fruit")]));

    await listCurrentFoodCatalogCategoryFacets(db.client);

    const query = db.queries.food_catalog_search_documents[0]!;
    expect(query.order.mock.calls.map((call) => call[0])).toEqual([
      "category_code",
      "food_id",
      "language_tag",
      "script_code",
    ]);
  });
});
