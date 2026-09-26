import { describe, expect, it } from "vitest";
import {
  classifyOwnerFavorite,
  summarizeOwnerFavoriteClassifications,
  type OwnerFavoriteResolutionFacts,
} from "@/lib/food-catalog/plan7-owner-reconciliation";

const OWNER_A = "10000000-0000-4000-8000-000000000001";
const OWNER_B = "10000000-0000-4000-8000-000000000002";
const FOOD_A = "20000000-0000-4000-8000-000000000001";

function facts(overrides: Partial<OwnerFavoriteResolutionFacts> = {}): OwnerFavoriteResolutionFacts {
  return {
    catalogFoods: [],
    myFoods: [],
    catalogFavoriteAlreadyExists: false,
    ...overrides,
  };
}

describe("Plan 7 owner favorite reconciliation classifier", () => {
  it("classifies a canonical global Food UUID as catalog-mappable", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: FOOD_A },
      facts({ catalogFoods: [{ id: FOOD_A }] }),
    )).toMatchObject({
      classification: "catalog_food",
      disposition: "catalog_mappable",
    });
  });

  it("treats an existing canonical favorite as already represented", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: FOOD_A },
      facts({
        catalogFoods: [{ id: FOOD_A }],
        catalogFavoriteAlreadyExists: true,
      }),
    )).toMatchObject({
      classification: "catalog_food",
      disposition: "catalog_already_mapped",
    });
  });

  it("preserves a same-owner My Food UUID", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: FOOD_A },
      facts({ myFoods: [{ id: FOOD_A, userId: OWNER_A, deletedAt: null }] }),
    )).toMatchObject({
      classification: "my_food",
      disposition: "my_food_preserved",
    });
  });

  it("blocks a cross-owner My Food UUID", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: FOOD_A },
      facts({ myFoods: [{ id: FOOD_A, userId: OWNER_B, deletedAt: null }] }),
    )).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "cross_owner_my_food",
    });
  });

  it("blocks a deleted same-owner My Food UUID", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: FOOD_A },
      facts({ myFoods: [{ id: FOOD_A, userId: OWNER_A, deletedAt: "2026-09-24T00:00:00Z" }] }),
    )).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "deleted_my_food",
    });
  });

  it("preserves a legacy text/log-derived key without guessing an owner Food", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: "banana|100 g" },
      facts(),
    )).toMatchObject({
      classification: "legacy_text",
      disposition: "legacy_text_preserved",
    });
  });

  it("blocks malformed UUID-like keys instead of treating them as text favorites", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: "20000000-0000-4000-8000" },
      facts(),
    )).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "malformed_key",
    });
  });

  it("blocks unknown UUIDs", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: FOOD_A },
      facts(),
    )).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "unknown_uuid",
    });
  });

  it("blocks a UUID that resolves to both Catalog Food and My Food authority", () => {
    expect(classifyOwnerFavorite(
      { userId: OWNER_A, foodKey: FOOD_A },
      facts({
        catalogFoods: [{ id: FOOD_A }],
        myFoods: [{ id: FOOD_A, userId: OWNER_A, deletedAt: null }],
      }),
    )).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "ambiguous_uuid",
    });
  });

  it("counts duplicate legacy rows independently without converting them", () => {
    const rows = [
      classifyOwnerFavorite({ userId: OWNER_A, foodKey: "banana|100 g" }, facts()),
      classifyOwnerFavorite({ userId: OWNER_A, foodKey: "banana|100 g" }, facts()),
    ];
    expect(summarizeOwnerFavoriteClassifications(rows)).toEqual({
      total: 2,
      catalog_mappable: 0,
      catalog_already_mapped: 0,
      my_food_preserved: 0,
      legacy_text_preserved: 2,
      blocked: 0,
    });
  });
});
