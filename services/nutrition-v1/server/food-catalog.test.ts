import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  findCatalogDuplicateByName,
  getCatalogVerificationStates,
  resolveCatalogFood,
  searchCatalogFoodsByName,
} from "@/services/nutrition-v1/server/food-catalog";

type Result = { data: any; error: null | { message?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "eq", "in", "ilike", "limit"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return q;
}

type Query = ReturnType<typeof query>;

function fakeSupabase(results: Result[]) {
  const queue = results.map(query);
  const seen: Query[] = [];
  const from = vi.fn((table: string) => {
    if (table !== "food_items") throw new Error(`Unexpected table query: ${table}`);
    const next = queue.shift();
    if (!next) throw new Error("Unexpected Food Catalog query.");
    seen.push(next);
    return next;
  });
  return { client: { from } as unknown as SupabaseClient, from, seen };
}

const mergedId = "11111111-1111-4111-8111-111111111111";
const activeId = "22222222-2222-4222-8222-222222222222";

describe("Nutrition V1 Food Catalog read boundary", () => {
  it("delegates legacy Food root reads through the Food Catalog compatibility boundary", () => {
    const source = readFileSync("services/nutrition-v1/server/food-catalog.ts", "utf8");
    expect(source).toContain("@/services/food-catalog/server/legacy-compatibility");
    expect(source).not.toMatch(/\.from\(\s*["']food_items["']\s*\)/);
  });

  it("follows merged redirects to the active canonical Food and preserves null nutrients", async () => {
    const db = fakeSupabase([
      { data: { id: mergedId, lifecycle_status: "merged", merged_into_food_id: activeId }, error: null },
      { data: { id: activeId, food_name: "Greek yogurt", serving_size: "170 g", calories: 100, protein_g: 10, carbs_g: 8, fat_g: 2, saturated_fat_g: null, fiber_g: null, sugars_g: 7, sodium_mg: 60, nutrition_basis_amount: 170, nutrition_basis_unit: "g", lifecycle_status: "active", merged_into_food_id: null, is_verified: true }, error: null },
    ]);

    const food = await resolveCatalogFood(db.client, mergedId);

    expect(food).toMatchObject({ id: activeId, name: "Greek yogurt", servingLabel: "170 g", verified: true });
    expect(food.nutrition).toMatchObject({ calories: 100, protein_g: 10, saturated_fat_g: null, fiber_g: null, basis_amount: 170, basis_unit: "g" });
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(db.seen[0].eq).toHaveBeenCalledWith("id", mergedId);
    expect(db.seen[1].eq).toHaveBeenCalledWith("id", activeId);
  });

  it("rejects inactive Foods and non-resolvable merge lineage for new use", async () => {
    const inactive = fakeSupabase([{ data: { id: activeId, lifecycle_status: "deprecated", merged_into_food_id: null }, error: null }]);
    await expect(resolveCatalogFood(inactive.client, activeId)).rejects.toThrow(/unavailable for new Nutrition writes/i);

    const brokenMerge = fakeSupabase([{ data: { id: mergedId, lifecycle_status: "merged", merged_into_food_id: "not-a-uuid" }, error: null }]);
    await expect(resolveCatalogFood(brokenMerge.client, mergedId)).rejects.toThrow(/merge lineage/i);
  });

  it("does not query verification state for an empty ID set", async () => {
    const from = vi.fn();
    const states = await getCatalogVerificationStates({ from } as unknown as SupabaseClient, []);
    expect(states.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns verification state only for requested Food IDs", async () => {
    const otherId = "33333333-3333-4333-8333-333333333333";
    const db = fakeSupabase([{ data: [
      { id: activeId, is_verified: true },
      { id: mergedId, is_verified: false },
      { id: otherId, is_verified: true },
    ], error: null }]);

    const states = await getCatalogVerificationStates(db.client, [activeId, mergedId]);

    expect(Array.from(states.entries())).toEqual([[activeId, true], [mergedId, false]]);
    expect(states.has(otherId)).toBe(false);
    expect(db.seen[0].in).toHaveBeenCalledWith("id", [activeId, mergedId]);
  });

  it("preserves the public MCP name query while returning current canonical Food values", async () => {
    const searchRow = { id: activeId, food_name: "Greek yogurt", serving_size: "170 g", calories: 100, protein_g: 10, carbs_g: 8, fat_g: 2, lifecycle_status: "active", merged_into_food_id: null };
    const resolvedRow = { ...searchRow, saturated_fat_g: null, fiber_g: null, sugars_g: 7, sodium_mg: 60, nutrition_basis_amount: 170, nutrition_basis_unit: "g", is_verified: true };
    const db = fakeSupabase([
      { data: [searchRow], error: null },
      { data: resolvedRow, error: null },
    ]);

    const foods = await searchCatalogFoodsByName(db.client, "Greek", 5);

    expect(foods).toEqual([{ id: activeId, food_name: "Greek yogurt", serving_size: "170 g", calories: 100, protein_g: 10, carbs_g: 8, fat_g: 2 }]);
    expect(db.seen[0].select).toHaveBeenCalledWith("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,lifecycle_status,merged_into_food_id");
    expect(db.seen[0].eq).toHaveBeenCalledWith("is_global", true);
    expect(db.seen[0].ilike).toHaveBeenCalledWith("food_name", "%Greek%");
    expect(db.seen[0].limit).toHaveBeenCalledWith(5);
    expect(db.seen[1].eq).toHaveBeenCalledWith("id", activeId);
  });

  it("finds only an active shared duplicate candidate", async () => {
    const db = fakeSupabase([{ data: { id: activeId, food_name: "Greek yogurt", serving_size: "170 g" }, error: null }]);

    const duplicate = await findCatalogDuplicateByName(db.client, " Greek yogurt ");

    expect(duplicate).toEqual({ id: activeId, food_name: "Greek yogurt", serving_size: "170 g" });
    expect(db.seen[0].eq).toHaveBeenCalledWith("is_global", true);
    expect(db.seen[0].eq).toHaveBeenCalledWith("lifecycle_status", "active");
    expect(db.seen[0].ilike).toHaveBeenCalledWith("food_name", "Greek yogurt");
  });

  it("surfaces catalog database errors instead of returning empty data", async () => {
    const resolveDb = fakeSupabase([{ data: null, error: { message: "resolve failed" } }]);
    await expect(resolveCatalogFood(resolveDb.client, activeId)).rejects.toThrow(/resolve failed/i);

    const verifyDb = fakeSupabase([{ data: null, error: { message: "verify failed" } }]);
    await expect(getCatalogVerificationStates(verifyDb.client, [activeId])).rejects.toThrow(/verify failed/i);

    const searchDb = fakeSupabase([{ data: null, error: { message: "search failed" } }]);
    await expect(searchCatalogFoodsByName(searchDb.client, "Yogurt", 5)).rejects.toThrow(/search failed/i);

    const duplicateDb = fakeSupabase([{ data: null, error: { message: "duplicate failed" } }]);
    await expect(findCatalogDuplicateByName(duplicateDb.client, "Yogurt")).rejects.toThrow(/duplicate failed/i);
  });
});
