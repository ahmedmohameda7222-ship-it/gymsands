import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createUserFood,
  deleteUserFood,
  findPossibleFoodDuplicate,
  setFoodPersonalCorrection,
  updateUserFood,
} from "@/services/nutrition-v1/server/user-foods";

type Result = { data: any; error: null | { message?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "insert", "upsert", "update", "delete", "eq", "is", "ilike", "limit"]) q[method] = vi.fn(() => q);
  q.single = vi.fn(async () => result);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return q;
}

type Query = ReturnType<typeof query>;

function fakeSupabase(tableQueries: Record<string, Query[]> = {}) {
  const queues = Object.fromEntries(Object.entries(tableQueries).map(([table, values]) => [table, [...values]])) as Record<string, Query[]>;
  const seen: Record<string, Query[]> = {};
  const from = vi.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Unexpected table query: ${table}`);
    (seen[table] ??= []).push(next);
    return next;
  });
  return { client: { from } as unknown as SupabaseClient, from, seen };
}

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foodId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function writeInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Homemade soup",
    servingLabel: "1 bowl",
    calories: 320,
    proteinG: null,
    carbsG: 40,
    fatG: null,
    basisAmount: 1,
    basisUnit: "serving" as const,
    ...overrides,
  };
}

describe("Nutrition V1 owner Food write authority", () => {
  it("creates a separate Custom Food without coercing unknown P/C/F to zero", async () => {
    const insert = query({ data: { id: foodId, food_name: "Homemade soup", protein_g: null, carbs_g: 40, fat_g: null }, error: null });
    const db = fakeSupabase({ user_food_items: [insert] });

    const result = await createUserFood(db.client, userId, writeInput({ createSeparately: true }));

    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      food_name: "Homemade soup",
      calories: 320,
      protein_g: null,
      carbs_g: 40,
      fat_g: null,
      nutrition_basis_amount: 1,
      nutrition_basis_unit: "serving",
      deleted_at: null,
    }));
    expect(result.duplicate).toBeNull();
    expect(result.food?.id).toBe(foodId);
  });

  it("returns a possible duplicate without silently inserting or merging", async () => {
    const personal = query({ data: null, error: null });
    const catalog = query({ data: { id: foodId, food_name: "Greek yogurt", serving_size: "170 g" }, error: null });
    const db = fakeSupabase({ user_food_items: [personal], food_items: [catalog] });

    const duplicate = await findPossibleFoodDuplicate(db.client, userId, "Greek yogurt");

    expect(duplicate).toMatchObject({ id: foodId, source: "catalog" });
    expect(personal.eq).toHaveBeenCalledWith("user_id", userId);
    expect(db.from).toHaveBeenCalledTimes(2);
  });

  it("updates only the active owner-scoped Custom Food", async () => {
    const update = query({ data: { id: foodId, food_name: "Updated soup" }, error: null });
    const db = fakeSupabase({ user_food_items: [update] });

    await updateUserFood(db.client, userId, writeInput({ id: foodId, name: "Updated soup" }));

    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ food_name: "Updated soup", deleted_at: null }));
    expect(update.eq).toHaveBeenCalledWith("id", foodId);
    expect(update.eq).toHaveBeenCalledWith("user_id", userId);
    expect(update.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("soft-deletes only the active owner-scoped Custom Food and preserves historical references", async () => {
    const remove = query({ data: { id: foodId }, error: null });
    const db = fakeSupabase({ user_food_items: [remove] });

    const result = await deleteUserFood(db.client, userId, foodId);

    expect(remove.update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
    expect(remove.eq).toHaveBeenCalledWith("id", foodId);
    expect(remove.eq).toHaveBeenCalledWith("user_id", userId);
    expect(remove.is).toHaveBeenCalledWith("deleted_at", null);
    expect(db.from).not.toHaveBeenCalledWith("food_logs");
    expect(result).toEqual({ foodId, deleted: true });
  });

  it("writes a nullable personal correction under the derived owner without changing canonical verification", async () => {
    const upsert = query({ data: { food_id: foodId, calories: 150, protein_g: null, carbs_g: null, fat_g: 3, basis_amount: 100, basis_unit: "g", is_active: true }, error: null });
    const db = fakeSupabase({ food_personal_corrections: [upsert] });

    const result = await setFoodPersonalCorrection(db.client, userId, {
      foodId,
      calories: 150,
      proteinG: null,
      carbsG: null,
      fatG: 3,
      basisAmount: 100,
      basisUnit: "g",
    });

    expect(upsert.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      food_id: foodId,
      calories: 150,
      protein_g: null,
      carbs_g: null,
      fat_g: 3,
      basis_amount: 100,
      basis_unit: "g",
      is_active: true,
    }), { onConflict: "user_id,food_id" });
    expect(JSON.stringify(upsert.upsert.mock.calls)).not.toMatch(/is_verified|verified_at|verified_source_record_id/);
    expect(result.food_id).toBe(foodId);
  });
});