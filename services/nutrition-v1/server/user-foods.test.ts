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
  for (const method of ["select", "insert", "upsert", "update", "delete", "eq", "neq", "is", "ilike", "limit"]) q[method] = vi.fn(() => q);
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

  it("returns an active shared catalog duplicate without silently inserting or merging", async () => {
    const personal = query({ data: null, error: null });
    const catalog = query({ data: { id: foodId, food_name: "Greek yogurt", serving_size: "170 g" }, error: null });
    const db = fakeSupabase({ user_food_items: [personal], food_items: [catalog] });

    const duplicate = await findPossibleFoodDuplicate(db.client, userId, "Greek yogurt");

    expect(duplicate).toMatchObject({ id: foodId, source: "catalog" });
    expect(personal.eq).toHaveBeenCalledWith("user_id", userId);
    expect(catalog.eq).toHaveBeenCalledWith("is_global", true);
    expect(catalog.eq).toHaveBeenCalledWith("lifecycle_status", "active");
    expect(db.from).toHaveBeenCalledTimes(2);
  });

  it("preserves duplicate precedence for the matching owner Food before the shared catalog", async () => {
    const personal = query({ data: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", food_name: "Greek yogurt", serving_size: "1 bowl" }, error: null });
    const catalog = query({ data: { id: foodId, food_name: "Greek yogurt", serving_size: "170 g" }, error: null });
    const db = fakeSupabase({ user_food_items: [personal], food_items: [catalog] });

    const duplicate = await findPossibleFoodDuplicate(db.client, userId, "Greek yogurt");

    expect(duplicate).toMatchObject({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", source: "my_food" });
    expect(personal.eq).toHaveBeenCalledWith("user_id", userId);
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

  it("writes a first Plan 6 Personal Override through the RPC with exact null/0 CAS and preserves numeric zero", async () => {
    const operationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const rpc = vi.fn(async () => ({
      data: { operationId, foodId, revisionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", pointerRevision: 1, isDeleted: false },
      error: null,
    }));
    const from = vi.fn(() => { throw new Error("Legacy personal correction table must not be used."); });
    const client = { rpc, from } as unknown as SupabaseClient;

    const result = await setFoodPersonalCorrection(client, userId, {
      operationId,
      foodId,
      calories: 0,
      proteinG: null,
      carbsG: null,
      fatG: 3,
      servingLabel: null,
      note: "mine",
      expectedRevisionId: null,
      expectedPointerRevision: 0,
    } as never);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("food_catalog_set_personal_override", {
      p_operation_id: operationId,
      p_food_id: foodId,
      p_expected_revision_id: null,
      p_expected_pointer_revision: 0,
      p_nutrition_override: { calories: 0, fat_g: 3 },
      p_serving_label: null,
      p_note: "mine",
    });
    expect(from).not.toHaveBeenCalled();
    expect(result).toMatchObject({ foodId, pointerRevision: 1 });
  });

  it("forwards an exact existing current revision/pointer CAS without latest-row inference", async () => {
    const operationId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const revisionId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const rpc = vi.fn(async () => ({
      data: { operationId, foodId, revisionId: "11111111-2222-4333-8444-555555555555", pointerRevision: 8, isDeleted: false },
      error: null,
    }));
    const client = { rpc, from: vi.fn(() => { throw new Error("Legacy personal correction table must not be used."); }) } as unknown as SupabaseClient;

    await setFoodPersonalCorrection(client, userId, {
      operationId,
      foodId,
      calories: 150,
      proteinG: null,
      carbsG: null,
      fatG: null,
      servingLabel: "My bowl",
      note: null,
      expectedRevisionId: revisionId,
      expectedPointerRevision: 7,
    } as never);

    expect(rpc).toHaveBeenCalledWith("food_catalog_set_personal_override", expect.objectContaining({
      p_expected_revision_id: revisionId,
      p_expected_pointer_revision: 7,
      p_serving_label: "My bowl",
    }));
  });

  it("surfaces a 40001 Personal Override CAS conflict instead of auto-retrying against newly-read state", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "40001", message: "Personal override CAS conflict." },
    }));
    const client = { rpc, from: vi.fn(() => { throw new Error("Legacy personal correction table must not be used."); }) } as unknown as SupabaseClient;

    await expect(setFoodPersonalCorrection(client, userId, {
      operationId: "12121212-1212-4121-8121-121212121212",
      foodId,
      calories: 150,
      proteinG: null,
      carbsG: null,
      fatG: null,
      servingLabel: null,
      note: null,
      expectedRevisionId: null,
      expectedPointerRevision: 0,
    } as never)).rejects.toThrow(/conflict/i);

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects legacy basis fields instead of silently reinterpreting them as Plan 6 override authority", async () => {
    const rpc = vi.fn();
    const client = { rpc, from: vi.fn(() => { throw new Error("Legacy personal correction table must not be used."); }) } as unknown as SupabaseClient;

    await expect(setFoodPersonalCorrection(client, userId, {
      operationId: "13131313-1313-4131-8131-131313131313",
      foodId,
      calories: 150,
      proteinG: null,
      carbsG: null,
      fatG: null,
      servingLabel: null,
      expectedRevisionId: null,
      expectedPointerRevision: 0,
      basisAmount: 100,
      basisUnit: "g",
    } as never)).rejects.toThrow(/basis/i);

    expect(rpc).not.toHaveBeenCalled();
  });
});
