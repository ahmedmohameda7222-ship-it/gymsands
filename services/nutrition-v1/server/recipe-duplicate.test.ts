import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/services/nutrition-v1/server/recipe-published", () => ({
  getPublishedRecipeDetail: vi.fn(async () => ({
    root: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    latestVersion: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Original",
      servings: 2,
      total_cooked_weight_g: 500,
      total_time_minutes: 30,
      notes: "notes",
      metadata: { cuisine: "Test" },
    },
    ingredients: [{ id: "11111111-1111-4111-8111-111111111111", position: 0, food_id: null, ingredient_name: "Salt", quantity: 1, unit: "g", frozen_nutrition: null }],
    instructions: [{ id: "22222222-2222-4222-8222-222222222222", position: 0, instruction: "Mix", ingredient_refs: ["11111111-1111-4111-8111-111111111111"], equipment_refs: [], dependency_action_ids: [], can_run_in_background: false, metadata: {} }],
    equipment: [],
  })),
}));

import { duplicatePublishedRecipeAtomically } from "@/services/nutrition-v1/server/recipe-duplicate";

const userId = "99999999-9999-4999-8999-999999999999";
const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => vi.clearAllMocks());

describe("Nutrition V1 atomic Recipe duplication", () => {
  it("remaps the graph in the trusted server domain and commits root, draft, and children in one RPC", async () => {
    const rpc = vi.fn(async () => ({ data: { recipeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", draftId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }, error: null }));
    const client = { rpc } as unknown as SupabaseClient;

    const result = await duplicatePublishedRecipeAtomically(client, userId, recipeId, (() => {
      const ids = ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
      return () => ids.shift()!;
    })());

    expect(result).toEqual({ recipeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", draftId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    expect(rpc).toHaveBeenCalledOnce();
    const [, payload] = rpc.mock.calls[0]!;
    expect(payload).toMatchObject({
      p_source_recipe_id: recipeId,
      p_source_version_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      p_name: "Original copy",
    });
    expect(payload.p_ingredients[0].id).toBe("33333333-3333-4333-8333-333333333333");
    expect(payload.p_actions[0].id).toBe("44444444-4444-4444-8444-444444444444");
    expect(payload.p_actions[0].ingredient_refs).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });

  it("does not expose a partial duplicate when the atomic database command fails", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "invalid graph" } }));
    const client = { rpc } as unknown as SupabaseClient;
    await expect(duplicatePublishedRecipeAtomically(client, userId, recipeId)).rejects.toThrow(/invalid graph/i);
    expect(rpc).toHaveBeenCalledOnce();
  });
});
