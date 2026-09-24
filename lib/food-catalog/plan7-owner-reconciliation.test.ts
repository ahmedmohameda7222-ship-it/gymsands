import { describe, expect, it } from "vitest";

import {
  classifyOwnerFavorite,
  summarizeOwnerFavoriteReconciliation,
  type OwnerFavoriteEvidence,
} from "./plan7-owner-reconciliation";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const catalogId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const catalogAlreadyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const myFoodId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const otherFoodId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const deletedFoodId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const unknownId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const collisionId = "99999999-9999-4999-8999-999999999999";

function evidence(overrides: Partial<OwnerFavoriteEvidence> = {}): OwnerFavoriteEvidence {
  return {
    catalogFoodIds: [catalogId, catalogAlreadyId, collisionId],
    myFoods: [
      { id: myFoodId, userId: ownerA, deletedAt: null },
      { id: otherFoodId, userId: ownerB, deletedAt: null },
      { id: deletedFoodId, userId: ownerA, deletedAt: "2026-09-20T10:00:00Z" },
      { id: collisionId, userId: ownerA, deletedAt: null },
    ],
    existingCatalogFavoriteFoodIds: [catalogAlreadyId],
    ...overrides,
  };
}

function row(foodKey: string) {
  return { userId: ownerA, foodKey };
}

describe("Plan 7 owner favorite reconciliation classifier", () => {
  it("classifies a unique global Food UUID as catalog-mappable", () => {
    expect(classifyOwnerFavorite(row(catalogId), evidence())).toMatchObject({
      classification: "catalog_food",
      disposition: "catalog_mappable",
    });
  });

  it("classifies an existing canonical food_favorites target as already represented", () => {
    expect(classifyOwnerFavorite(row(catalogAlreadyId), evidence())).toMatchObject({
      classification: "catalog_food",
      disposition: "catalog_already_mapped",
    });
  });

  it("preserves a same-owner active My Food UUID", () => {
    expect(classifyOwnerFavorite(row(myFoodId), evidence())).toMatchObject({
      classification: "my_food",
      disposition: "my_food_preserved",
    });
  });

  it("blocks a cross-owner My Food UUID", () => {
    expect(classifyOwnerFavorite(row(otherFoodId), evidence())).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "cross_owner_my_food",
    });
  });

  it("blocks a deleted My Food UUID", () => {
    expect(classifyOwnerFavorite(row(deletedFoodId), evidence())).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "deleted_my_food",
    });
  });

  it("preserves a normalized text/log-derived key without guessing identity", () => {
    expect(classifyOwnerFavorite(row("greek yogurt|170 g"), evidence())).toMatchObject({
      classification: "legacy_text",
      disposition: "legacy_text_preserved",
    });
  });

  it("blocks a malformed UUID-like key instead of treating it as free text", () => {
    expect(classifyOwnerFavorite(row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaZ"), evidence())).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "malformed_key",
    });
  });

  it("blocks an unknown valid UUID", () => {
    expect(classifyOwnerFavorite(row(unknownId), evidence())).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "unknown_uuid",
    });
  });

  it("blocks a UUID that resolves in more than one authority source", () => {
    expect(classifyOwnerFavorite(row(collisionId), evidence())).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "ambiguous_uuid",
    });
  });

  it("counts duplicate legacy rows independently without blanket conversion", () => {
    expect(summarizeOwnerFavoriteReconciliation([
      row(catalogId),
      row(catalogId),
      row(catalogAlreadyId),
      row(myFoodId),
      row("greek yogurt|170 g"),
      row(unknownId),
    ], evidence())).toEqual({
      total: 6,
      catalog_mappable: 2,
      catalog_already_mapped: 1,
      my_food_preserved: 1,
      legacy_text_preserved: 1,
      blocked: 1,
    });
  });

  it("fails closed when the favorite owner identity is malformed", () => {
    expect(classifyOwnerFavorite(
      { userId: "not-a-user", foodKey: catalogId },
      evidence(),
    )).toMatchObject({
      classification: "blocked",
      disposition: "blocked",
      reason: "invalid_owner",
    });
  });
});
