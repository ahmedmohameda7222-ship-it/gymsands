import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SavedMealBundleSnapshot,
  SavedMealFoodItemSnapshot,
  SavedMealRecipeItemSnapshot,
} from "@/lib/nutrition-v1/contracts";
import {
  createSavedMeal,
  purgeSavedMealNow,
  resolveSavedMealBundleSnapshot,
  restoreSavedMeal,
  softDeleteSavedMeal,
  updateSavedMeal,
} from "@/services/nutrition-v1/server/saved-meals";

const userId = "11111111-1111-4111-8111-111111111111";
const operationId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const savedMealId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foodId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const recipeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const recipeVersionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const food: SavedMealFoodItemSnapshot = {
  kind: "food",
  food_id: foodId,
  frozen_name: "Greek yogurt",
  resolved_quantity: 1.5,
  resolved_serving_label: "170 g",
  frozen_nutrition: {
    calories: 150,
    protein_g: 17,
    carbs_g: 9,
    fat_g: 4,
    fiber_g: null,
  },
};

const recipe: SavedMealRecipeItemSnapshot = {
  kind: "recipe",
  recipe: {
    recipe_id: recipeId,
    recipe_version_id: recipeVersionId,
    resolved_serving_quantity: 1,
    resolved_serving_label: "1 bowl",
    frozen_recipe_name: "Chicken bowl",
    frozen_nutrition: {
      calories: 510,
      protein_g: 43,
      carbs_g: 56,
      fat_g: 14,
      fiber_g: 8,
    },
  },
};

type QueryResult = { data: unknown; error: null | { message: string } };
type Query = ReturnType<typeof query>;

function query(result: QueryResult) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "is", "in", "order"]) q[method] = vi.fn(() => q);
  q.single = vi.fn(async () => result);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return q as {
    select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>; is: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn>;
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  };
}

function fakeSupabase(tableQueries: Record<string, Query[]>, rpcResults: QueryResult[] = [{ data: null, error: null }]) {
  const queues = Object.fromEntries(Object.entries(tableQueries).map(([table, values]) => [table, [...values]])) as Record<string, Query[]>;
  const rpcQueue = [...rpcResults];
  const from = vi.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Unexpected table query: ${table}`);
    return next;
  });
  const rpc = vi.fn(async () => rpcQueue.shift() ?? { data: null, error: null });
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc };
}

beforeEach(() => vi.clearAllMocks());

describe("Nutrition V1 Saved Meal authority", () => {
  it("creates root plus complete frozen item set through one transactional replay authority", async () => {
    const root = { id: savedMealId, user_id: userId, name: "Lunch staples", note: null, is_favorite: false, deleted_at: null, purge_after: null };
    const db = fakeSupabase({}, [{ data: root, error: null }]);

    const result = await createSavedMeal(db.client, userId, { operationId, name: "Lunch staples", items: [food, recipe] });

    expect(result.id).toBe(savedMealId);
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenCalledWith("create_nutrition_saved_meal_idempotent", {
      p_operation_id: operationId,
      p_name: "Lunch staples",
      p_note: null,
      p_is_favorite: false,
      p_items: [food, recipe],
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects Saved Meal nesting before any database write", async () => {
    const db = fakeSupabase({});
    const nested = { kind: "saved_meal", saved_meal: { saved_meal_id: savedMealId, frozen_name: "Nested", items: [] } } as never;
    await expect(createSavedMeal(db.client, userId, { operationId, name: "Invalid", items: [nested] })).rejects.toThrow(/food|recipe|nest/i);
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("resolves a frozen bundle from persisted item snapshots", async () => {
    const root = query({ data: { id: savedMealId, name: "Lunch staples", deleted_at: null }, error: null });
    const items = query({ data: [
      { item_type: "food", food_id: foodId, recipe_id: null, recipe_version_id: null, resolved_quantity: food.resolved_quantity, resolved_serving_label: food.resolved_serving_label, frozen_name: food.frozen_name, frozen_snapshot: food, position: 0 },
      { item_type: "recipe", food_id: null, recipe_id: recipeId, recipe_version_id: recipeVersionId, resolved_quantity: recipe.recipe.resolved_serving_quantity, resolved_serving_label: recipe.recipe.resolved_serving_label, frozen_name: recipe.recipe.frozen_recipe_name, frozen_snapshot: recipe, position: 1 },
    ], error: null });
    const db = fakeSupabase({ nutrition_saved_meals: [root], nutrition_saved_meal_items: [items] });
    const snapshot = await resolveSavedMealBundleSnapshot(db.client, userId, savedMealId);
    expect(snapshot).toEqual<SavedMealBundleSnapshot>({ saved_meal_id: savedMealId, frozen_name: "Lunch staples", items: [food, recipe] });
  });

  it("updates root plus complete replacement item set through one transaction while frozen consumers remain independent", async () => {
    const previousConsumer: SavedMealBundleSnapshot = { saved_meal_id: savedMealId, frozen_name: "Lunch staples", items: [structuredClone(food), structuredClone(recipe)] };
    const before = structuredClone(previousConsumer);
    const updated = { id: savedMealId, user_id: userId, name: "Updated lunch", note: null, is_favorite: false, deleted_at: null, purge_after: null };
    const db = fakeSupabase({}, [{ data: updated, error: null }]);

    const result = await updateSavedMeal(db.client, userId, savedMealId, { name: "Updated lunch", items: [{ ...food, frozen_name: "New yogurt label" }] });

    expect(result.name).toBe("Updated lunch");
    expect(previousConsumer).toEqual(before);
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenCalledWith("update_nutrition_saved_meal", {
      p_saved_meal_id: savedMealId,
      p_name: "Updated lunch",
      p_note: null,
      p_is_favorite: false,
      p_items: [{ ...food, frozen_name: "New yogurt label" }],
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("propagates transaction failure without compensating client writes", async () => {
    const db = fakeSupabase({}, [{ data: null, error: { message: "invalid child" } }]);
    await expect(createSavedMeal(db.client, userId, { operationId, name: "Broken", items: [food] })).rejects.toThrow(/invalid child/i);
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("soft deletes and restores the same Saved Meal ID through owner-derived lifecycle RPCs", async () => {
    const deleted = fakeSupabase({}, [{ data: { id: savedMealId, deletedAt: "2026-08-25T00:00:00Z", purgeAfter: "2026-09-24T00:00:00Z" }, error: null }]);
    expect((await softDeleteSavedMeal(deleted.client, savedMealId)).id).toBe(savedMealId);
    expect(deleted.rpc).toHaveBeenCalledWith("soft_delete_nutrition_saved_meal", { p_saved_meal_id: savedMealId });

    const restored = fakeSupabase({}, [{ data: { id: savedMealId, restored: true }, error: null }]);
    expect((await restoreSavedMeal(restored.client, savedMealId)).id).toBe(savedMealId);
    expect(restored.rpc).toHaveBeenCalledWith("restore_nutrition_saved_meal", { p_saved_meal_id: savedMealId });
  });

  it("purges only the reusable Saved Meal source so frozen consumers remain independent", async () => {
    const db = fakeSupabase({}, [{ data: { id: savedMealId, permanentlyDeleted: true }, error: null }]);
    expect((await purgeSavedMealNow(db.client, savedMealId)).id).toBe(savedMealId);
    expect(db.rpc).toHaveBeenCalledWith("purge_nutrition_saved_meal_now", { p_saved_meal_id: savedMealId });
    expect(db.from).not.toHaveBeenCalled();
  });
});
