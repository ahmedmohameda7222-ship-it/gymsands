import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertFoodCatalogOwner,
  deprecateFood,
  listFoodCatalogCandidates,
  mergeFood,
  normalizeFood,
  publishFood,
  restoreFood,
  unverifyFood,
  verifyFood,
} from "@/services/nutrition-v1/server/food-curation";

const foodId = "11111111-1111-4111-8111-111111111111";
const targetFoodId = "22222222-2222-4222-8222-222222222222";
const sourceRecordId = "33333333-3333-4333-8333-333333333333";

function fakeSupabase() {
  const from = vi.fn(() => {
    throw new Error("Legacy curation must not reach direct Food persistence.");
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

const authorized = { authorized: true as const };
const unauthorized = { authorized: false as const };

const retired = /legacy food catalog curation is retired|plan 6 named governance commands/i;

describe("Nutrition V1 legacy Food Catalog curation retirement", () => {
  it("keeps inspection authorization explicit without using role === admin as canonical authority", () => {
    expect(() => assertFoodCatalogOwner(authorized)).not.toThrow();
    expect(() => assertFoodCatalogOwner(unauthorized)).toThrow(/authorization/i);
  });

  it("fails closed before any persistence access for the retired list/read surface", async () => {
    const db = fakeSupabase();
    await expect(listFoodCatalogCandidates(db.client, authorized, { limit: 10 })).rejects.toThrow(retired);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("fails closed before any persistence access for every retired global mutation family", async () => {
    const db = fakeSupabase();
    const operations = [
      () => normalizeFood(db.client, authorized, { foodId, food_name: "Changed" }),
      () => publishFood(db.client, authorized, foodId),
      () => verifyFood(db.client, authorized, { foodId, sourceRecordId }),
      () => unverifyFood(db.client, authorized, foodId),
      () => mergeFood(db.client, authorized, { sourceFoodId: foodId, targetFoodId }),
      () => deprecateFood(db.client, authorized, foodId),
      () => restoreFood(db.client, authorized, foodId),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toThrow(retired);
    }
    expect(db.from).not.toHaveBeenCalled();
  });

  it("denies unauthorized callers before the retirement response", async () => {
    const db = fakeSupabase();
    await expect(publishFood(db.client, unauthorized, foodId)).rejects.toThrow(/authorization/i);
    expect(db.from).not.toHaveBeenCalled();
  });
});
