import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listFoodLibrary } from "@/services/nutrition-v1/server/food-library";
import { autosaveRecipeDraft } from "@/services/nutrition-v1/server/recipes";
import { syncCookingSessionState } from "@/services/nutrition-v1/server/cooking-sessions";

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const actionStateId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Result = { data: any; error: null | { message: string; code?: string } };

function rpcOnlyClient(result: Result) {
  const rpc = vi.fn(async () => result);
  const from = vi.fn((table: string) => {
    throw new Error(`Direct table write is not atomic: ${table}`);
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

function query(data: any[] = []) {
  const result = { data, error: null };
  const q: Record<string, any> = {};
  for (const method of ["select", "eq", "neq", "is", "order", "limit", "ilike", "in"]) {
    q[method] = vi.fn(() => q);
  }
  q.then = (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

it("persists Cooking Session revision and child state through one transactional RPC", async () => {
  const db = rpcOnlyClient({ data: { stateRevision: 5 }, error: null });

  const result = await syncCookingSessionState(db.client, userId, sessionId, {
    expectedRevision: 4,
    currentActionKey: "step-2",
    lastActiveAt: "2026-08-27T10:00:00.000Z",
    actionStates: [{
      id: actionStateId,
      actionKey: "step-2",
      state: "active",
      stateRevision: 5,
    }],
    timers: [],
  });

  expect(result).toEqual({ stateRevision: 5 });
  expect(db.rpc).toHaveBeenCalledTimes(1);
  expect(db.rpc).toHaveBeenCalledWith("sync_nutrition_cooking_session_state", expect.objectContaining({
    p_session_id: sessionId,
    p_expected_revision: 4,
    p_current_action_key: "step-2",
  }));
  expect(db.from).not.toHaveBeenCalled();
});

it("replaces a Recipe Working Draft and all child rows through one transactional RPC", async () => {
  const db = rpcOnlyClient({
    data: {
      id: draftId,
      recipe_id: recipeId,
      user_id: userId,
      name: "Chicken bowl",
      servings: 4,
    },
    error: null,
  });

  const saved = await autosaveRecipeDraft(db.client, userId, recipeId, {
    name: "Chicken bowl",
    servings: 4,
    ingredients: [{ ingredient_name: "Chicken", quantity: 500, unit: "g" }],
    instructions: [{ instruction: "Cook the chicken." }],
    equipment: [{ name: "Pan", quantity: 1 }],
  });

  expect(saved).toMatchObject({ id: draftId, recipe_id: recipeId });
  expect(db.rpc).toHaveBeenCalledTimes(1);
  expect(db.rpc).toHaveBeenCalledWith("autosave_nutrition_recipe_draft", expect.objectContaining({
    p_recipe_id: recipeId,
  }));
  expect(db.from).not.toHaveBeenCalled();
});

it("limits normal member Food Catalog discovery to active canonical rows", async () => {
  const catalog = query([]);
  const personal = query([]);
  const aliases = query([]);
  const favorites = query([]);
  const corrections = query([]);
  const logs = query([]);
  const queues: Record<string, ReturnType<typeof query>[]> = {
    food_items: [catalog],
    user_food_items: [personal],
    food_aliases: [aliases],
    food_favorites: [favorites],
    food_personal_corrections: [corrections],
    food_logs: [logs],
  };
  const from = vi.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Unexpected table query: ${table}`);
    return next;
  });
  const client = { from } as unknown as SupabaseClient;

  await listFoodLibrary(client, userId, { query: "chicken", locale: "en" });

  expect(catalog.eq).toHaveBeenCalledWith("is_global", true);
  expect(catalog.eq).toHaveBeenCalledWith("lifecycle_status", "active");
  expect(catalog.neq).not.toHaveBeenCalledWith("lifecycle_status", "merged");
});

describe("review-correction fixtures", () => {
  it("keeps identifiers UUID-shaped so database contract tests stay realistic", () => {
    expect([userId, recipeId, draftId, sessionId, actionStateId].every((value) => /^[0-9a-f-]{36}$/.test(value))).toBe(true);
  });
});
