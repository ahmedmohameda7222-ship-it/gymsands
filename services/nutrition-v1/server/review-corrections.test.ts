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
      revision: 1,
    },
    error: null,
  });

  const saved = await autosaveRecipeDraft(db.client, userId, recipeId, {
    name: "Chicken bowl",
    servings: 4,
    ingredients: [{ ingredient_name: "Chicken", quantity: 500, unit: "g" }],
    instructions: [{ instruction: "Cook the chicken." }],
    equipment: [{ name: "Pan", quantity: 1 }],
  }, 0);

  expect(saved).toMatchObject({ id: draftId, recipe_id: recipeId, revision: 1 });
  expect(db.rpc).toHaveBeenCalledTimes(1);
  expect(db.rpc).toHaveBeenCalledWith("autosave_nutrition_recipe_draft", expect.objectContaining({
    p_recipe_id: recipeId,
    p_expected_revision: 0,
  }));
  expect(db.from).not.toHaveBeenCalled();
});

it("delegates member Food Library discovery to the Food Catalog V2 search boundary with explicit language, script, and market context", async () => {
  const db = rpcOnlyClient({ data: { items: [], nextCursor: null }, error: null });

  await listFoodLibrary(db.client, userId, {
    query: "chicken",
    locale: "de",
    scriptCode: "Latn",
    marketScopeCode: "DE",
  } as never);

  expect(db.rpc).toHaveBeenCalledTimes(1);
  expect(db.rpc).toHaveBeenCalledWith("search_food_catalog_v2", expect.objectContaining({
    p_query: "chicken",
    p_language_tag: "de",
    p_script_code: "Latn",
    p_market_scope_code: "DE",
    p_scope: "all",
  }));
  expect(db.from).not.toHaveBeenCalled();
});

describe("review-correction fixtures", () => {
  it("keeps identifiers UUID-shaped so database contract tests stay realistic", () => {
    expect([userId, recipeId, draftId, sessionId, actionStateId].every((value) => /^[0-9a-f-]{36}$/.test(value))).toBe(true);
  });
});
