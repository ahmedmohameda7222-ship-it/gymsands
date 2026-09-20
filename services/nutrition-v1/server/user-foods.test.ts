import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createUserFood,
  deleteUserFood,
  findPossibleFoodDuplicate,
  getFoodPersonalCorrectionState,
  setFoodPersonalCorrection,
  updateUserFood,
} from "@/services/nutrition-v1/server/user-foods";

const generation = vi.hoisted(() => ({
  resolve: vi.fn(),
}));
const library = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("@/services/food-catalog/server/current-generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/food-catalog/server/current-generation-service")>(
    "@/services/food-catalog/server/current-generation-service",
  );
  return {
    ...actual,
    resolveCurrentGenerationFoodForNewUseFromSupabase: generation.resolve,
  };
});
vi.mock("@/services/nutrition-v1/server/food-library", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/food-library")>(
    "@/services/nutrition-v1/server/food-library",
  );
  return { ...actual, listFoodLibrary: library.list };
});

type Result = { data: any; error: null | { message?: string; code?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "insert", "upsert", "update", "delete", "eq", "neq", "is", "ilike", "limit"]) q[method] = vi.fn(() => q);
  q.single = vi.fn(async () => result);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return q;
}

type Query = ReturnType<typeof query>;

function fakeSupabase(
  tableQueries: Record<string, Query[]> = {},
  rpcResults: Result[] = [],
) {
  const queues = Object.fromEntries(Object.entries(tableQueries).map(([table, values]) => [table, [...values]])) as Record<string, Query[]>;
  const seen: Record<string, Query[]> = {};
  const rpcQueue = [...rpcResults];
  const from = vi.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Unexpected table query: ${table}`);
    (seen[table] ??= []).push(next);
    return next;
  });
  const rpc = vi.fn(async () => {
    const next = rpcQueue.shift();
    if (!next) throw new Error("Unexpected RPC call.");
    return next;
  });
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, seen };
}

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foodId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const survivorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const operationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const revisionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const catalogClient = { authority: "catalog" } as unknown as SupabaseClient;

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

function correctionInput(overrides: Record<string, unknown> = {}) {
  return {
    foodId,
    operationId,
    expectedRevisionId: null,
    expectedPointerRevision: 0,
    calories: 150,
    proteinG: null,
    carbsG: null,
    fatG: 3,
    saturatedFatG: null,
    fiberG: null,
    sugarsG: null,
    sodiumMg: null,
    servingLabel: null,
    note: null,
    ...overrides,
  };
}

function currentOverride(overrides: Record<string, unknown> = {}) {
  return {
    foodId: survivorId,
    hasOverride: true,
    revisionId,
    pointerRevision: 7,
    isDeleted: false,
    nutritionOverride: { protein_g: 12 },
    servingLabel: "My bowl",
    note: "mine",
    ...overrides,
  };
}

describe("Nutrition V1 owner Food write authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generation.resolve.mockResolvedValue({
      resolvedFoodId: survivorId,
      food: { lifecycle: "active" },
    });
    library.list.mockResolvedValue({ items: [], nextCursor: null });
  });

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

  it("returns an exact current Catalog candidate as an advisory possible match", async () => {
    library.list.mockResolvedValueOnce({
      items: [{
        id: foodId,
        source: "catalog",
        name: "Greek yogurt",
        servingLabel: "170 g",
      }],
      nextCursor: null,
    });
    const db = fakeSupabase();

    const duplicate = await findPossibleFoodDuplicate(db.client, userId, "Greek yogurt");

    expect(duplicate).toEqual({
      id: foodId,
      source: "catalog",
      food_name: "Greek yogurt",
      serving_size: "170 g",
    });
    expect(library.list).toHaveBeenCalledWith(db.client, userId, expect.objectContaining({
      query: "Greek yogurt",
      locale: "en",
      limit: 20,
      scope: "all",
    }));
    expect(db.from).not.toHaveBeenCalledWith("food_items");
  });

  it("treats punctuation/spacing normalization as a strong advisory match", async () => {
    library.list.mockResolvedValueOnce({
      items: [{
        id: foodId,
        source: "catalog",
        name: "Greek yogurt",
        servingLabel: "170 g",
      }],
      nextCursor: null,
    });
    const db = fakeSupabase();

    const duplicate = await findPossibleFoodDuplicate(db.client, userId, "  Greek-yogurt  ");

    expect(duplicate).toMatchObject({ id: foodId, source: "catalog" });
  });

  it("ignores weak V2 candidates instead of turning them into duplicate authority", async () => {
    library.list.mockResolvedValueOnce({
      items: [{
        id: foodId,
        source: "catalog",
        name: "Greek yogurt vanilla",
        servingLabel: "170 g",
      }],
      nextCursor: null,
    });
    const db = fakeSupabase();

    expect(await findPossibleFoodDuplicate(db.client, userId, "Greek yogurt")).toBeNull();
  });

  it("preserves owner My Food precedence when both exact owner and Catalog candidates are advisory matches", async () => {
    const myFoodId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    library.list.mockResolvedValueOnce({
      items: [
        { id: foodId, source: "catalog", name: "Greek yogurt", servingLabel: "170 g" },
        { id: myFoodId, source: "my_food", name: "Greek yogurt", servingLabel: "1 bowl" },
      ],
      nextCursor: null,
    });
    const db = fakeSupabase();

    const duplicate = await findPossibleFoodDuplicate(db.client, userId, "Greek yogurt");

    expect(duplicate).toEqual({
      id: myFoodId,
      source: "my_food",
      food_name: "Greek yogurt",
      serving_size: "1 bowl",
    });
  });

  it("lets the user ignore an advisory match and create separately without reusing duplicate authority", async () => {
    library.list.mockResolvedValueOnce({
      items: [{ id: foodId, source: "catalog", name: "Homemade soup", servingLabel: "1 bowl" }],
      nextCursor: null,
    });
    const insert = query({ data: { id: foodId, food_name: "Homemade soup" }, error: null });
    const db = fakeSupabase({ user_food_items: [insert] });

    const result = await createUserFood(db.client, userId, writeInput({ createSeparately: true }));

    expect(result.duplicate).toBeNull();
    expect(result.food?.id).toBe(foodId);
    expect(library.list).not.toHaveBeenCalled();
  });

  it("does not accept provider-only suggestions as canonical duplicate authority", async () => {
    library.list.mockResolvedValueOnce({
      items: [{
        id: "provider:123",
        source: "provider_suggestion",
        name: "Greek yogurt",
        servingLabel: "170 g",
      }],
      nextCursor: null,
    });
    const db = fakeSupabase();

    expect(await findPossibleFoodDuplicate(db.client, userId, "Greek yogurt")).toBeNull();
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

  it("reads current Personal Override CAS authority for the final current-generation survivor", async () => {
    const db = fakeSupabase({}, [{ data: currentOverride(), error: null }]);

    const state = await getFoodPersonalCorrectionState(db.client, catalogClient, userId, foodId);

    expect(generation.resolve).toHaveBeenCalledWith(catalogClient, foodId);
    expect(db.rpc).toHaveBeenCalledWith("food_catalog_get_current_personal_override_v1", { p_food_id: survivorId });
    expect(state).toMatchObject({
      foodId: survivorId,
      hasOverride: true,
      revisionId,
      pointerRevision: 7,
      isDeleted: false,
    });
    expect(db.from).not.toHaveBeenCalledWith("food_personal_overrides");
    expect(db.from).not.toHaveBeenCalledWith("food_personal_override_revisions");
    expect(db.from).not.toHaveBeenCalledWith("food_personal_corrections");
  });

  it("preserves tombstone pointer identity for exact later CAS", async () => {
    const db = fakeSupabase({}, [{
      data: currentOverride({
        isDeleted: true,
        nutritionOverride: null,
        servingLabel: null,
        note: null,
      }),
      error: null,
    }]);

    const state = await getFoodPersonalCorrectionState(db.client, catalogClient, userId, foodId);

    expect(state).toMatchObject({
      foodId: survivorId,
      hasOverride: true,
      revisionId,
      pointerRevision: 7,
      isDeleted: true,
    });
  });

  it("writes Product correction through Plan 6 Personal Override with caller-preserved operation identity and exact no-pointer CAS", async () => {
    const db = fakeSupabase({}, [{
      data: {
        operationId,
        foodId: survivorId,
        revisionId,
        pointerRevision: 1,
        isDeleted: false,
      },
      error: null,
    }]);

    const result = await setFoodPersonalCorrection(db.client, catalogClient, userId, correctionInput());

    expect(generation.resolve).toHaveBeenCalledWith(catalogClient, foodId);
    expect(db.rpc).toHaveBeenCalledWith("food_catalog_set_personal_override", {
      p_operation_id: operationId,
      p_food_id: survivorId,
      p_expected_revision_id: null,
      p_expected_pointer_revision: 0,
      p_nutrition_override: {
        calories: 150,
        protein_g: null,
        carbs_g: null,
        fat_g: 3,
        saturated_fat_g: null,
        fiber_g: null,
        sugars_g: null,
        sodium_mg: null,
      },
      p_serving_label: null,
      p_note: null,
    });
    expect(db.from).not.toHaveBeenCalledWith("food_personal_corrections");
    expect(result).toMatchObject({ foodId: survivorId, operationId });
  });

  it("uses the exact existing/tombstone revision and pointer supplied from current-read authority", async () => {
    const db = fakeSupabase({}, [{
      data: {
        operationId,
        foodId: survivorId,
        revisionId: "ffffffff-1111-4111-8111-ffffffffffff",
        pointerRevision: 8,
        isDeleted: false,
      },
      error: null,
    }]);

    await setFoodPersonalCorrection(db.client, catalogClient, userId, correctionInput({
      expectedRevisionId: revisionId,
      expectedPointerRevision: 7,
      servingLabel: "My exact bowl",
      note: "owner note",
    }));

    expect(db.rpc).toHaveBeenCalledWith("food_catalog_set_personal_override", expect.objectContaining({
      p_operation_id: operationId,
      p_food_id: survivorId,
      p_expected_revision_id: revisionId,
      p_expected_pointer_revision: 7,
      p_serving_label: "My exact bowl",
      p_note: "owner note",
    }));
  });

  it("does not silently re-read or retry a Personal Override CAS conflict", async () => {
    const db = fakeSupabase({}, [{
      data: null,
      error: { code: "40001", message: "Personal override CAS conflict." },
    }]);

    await expect(setFoodPersonalCorrection(
      db.client,
      catalogClient,
      userId,
      correctionInput({ expectedRevisionId: revisionId, expectedPointerRevision: 7 }),
    )).rejects.toThrow(/CAS conflict/i);

    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("food_catalog_set_personal_override", expect.any(Object));
    expect(db.rpc).not.toHaveBeenCalledWith("food_catalog_get_current_personal_override_v1", expect.any(Object));
  });

  it("passes the same operation ID and same semantic RPC command on an exact retry", async () => {
    const replay = {
      operationId,
      foodId: survivorId,
      revisionId,
      pointerRevision: 1,
      isDeleted: false,
    };
    const db = fakeSupabase({}, [
      { data: replay, error: null },
      { data: replay, error: null },
    ]);
    const input = correctionInput();

    await setFoodPersonalCorrection(db.client, catalogClient, userId, input);
    await setFoodPersonalCorrection(db.client, catalogClient, userId, input);

    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(db.rpc.mock.calls[0]).toEqual(db.rpc.mock.calls[1]);
  });

  it("surfaces changed semantics under a reused operation ID instead of inventing a retry identity", async () => {
    const db = fakeSupabase({}, [{
      data: null,
      error: { code: "23514", message: "Personal override operation ID was reused with different semantics." },
    }]);

    await expect(setFoodPersonalCorrection(
      db.client,
      catalogClient,
      userId,
      correctionInput({ calories: 151 }),
    )).rejects.toThrow(/different semantics/i);

    expect(db.rpc).toHaveBeenCalledWith("food_catalog_set_personal_override", expect.objectContaining({
      p_operation_id: operationId,
      p_nutrition_override: expect.objectContaining({ calories: 151 }),
    }));
  });
});
