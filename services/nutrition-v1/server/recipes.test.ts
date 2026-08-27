import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  autosaveRecipeDraft,
  createRecipeDraft,
  discardRecipeDraft,
  publishRecipeDraft,
  purgeRecipeNow,
  restoreRecipe,
  softDeleteRecipe,
} from "@/services/nutrition-v1/server/recipes";
import { normalizeRecipeMcpDraftMutation } from "@/lib/mcp/tool-executor-safe";
import { MCP_RECIPE_SCOPES, MCP_SCOPES } from "@/lib/mcp/scopes";
import { NUTRITION_RECIPE_EXTERNAL_PROMPTS } from "@/lib/ai/prompt-catalog/nutrition";
import { NUTRITION_RECIPE_EXTERNAL_CONTRACTS } from "@/lib/ai/prompt-contracts/nutrition";

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const v1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const v2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Result = { data: any; error: null | { message: string; code?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "is", "order", "limit"]) {
    q[method] = vi.fn(() => q);
  }
  q.single = vi.fn(async () => result);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

type Query = ReturnType<typeof query>;

function fakeSupabase(tableQueries: Record<string, Query[]> = {}, rpcResult: Result = { data: null, error: null }) {
  const queues = Object.fromEntries(Object.entries(tableQueries).map(([table, values]) => [table, [...values]])) as Record<string, Query[]>;
  const seen: Record<string, Query[]> = {};
  const from = vi.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Unexpected table query: ${table}`);
    (seen[table] ??= []).push(next);
    return next;
  });
  const rpc = vi.fn(async () => rpcResult);
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, seen };
}

const completeDraft = {
  name: "Chicken bowl",
  servings: 4,
  ingredients: [{ ingredient_name: "Chicken", food_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", quantity: 500, unit: "g" }],
  instructions: [{ instruction: "Cook using the confirmed recipe instructions." }],
  equipment: [],
};

beforeEach(() => vi.clearAllMocks());

describe("Nutrition V1 Recipe server authority", () => {
  it("creates an incomplete Working Draft and root atomically without publishing it", async () => {
    const db = fakeSupabase({}, {
      data: {
        recipeId,
        draftId,
        recipe: { id: recipeId, user_id: userId, name: "Chicken bowl" },
        draft: { id: draftId, recipe_id: recipeId, user_id: userId, name: "Chicken bowl", servings: null },
      },
      error: null,
    });

    const created = await createRecipeDraft(db.client, userId, { name: "Chicken bowl" });

    expect(created.recipeId).toBe(recipeId);
    expect(created.draftId).toBe(draftId);
    expect(db.rpc).toHaveBeenCalledWith("create_nutrition_recipe_draft", expect.objectContaining({
      p_name: "Chicken bowl",
      p_servings: null,
    }));
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("autosaves the Working Draft atomically and never mutates a published Recipe version", async () => {
    const db = fakeSupabase({}, {
      data: { id: draftId, recipe_id: recipeId, user_id: userId, name: "Chicken bowl edited", servings: 4 },
      error: null,
    });

    await autosaveRecipeDraft(db.client, userId, recipeId, { ...completeDraft, name: "Chicken bowl edited" });

    expect(db.rpc).toHaveBeenCalledWith("autosave_nutrition_recipe_draft", expect.objectContaining({
      p_recipe_id: recipeId,
      p_ingredients: completeDraft.ingredients,
      p_instructions: completeDraft.instructions,
      p_equipment: completeDraft.equipment,
    }));
    expect(db.from).not.toHaveBeenCalled();
  });

  it("publishes v1 -> Working Draft -> v2 only through the owner-derived transactional RPC", async () => {
    const db = fakeSupabase({}, {
      data: {
        recipeId,
        recipeVersionId: v2,
        versionNumber: 2,
        version: {
          id: v2,
          recipe_id: recipeId,
          user_id: userId,
          version_number: 2,
          name: completeDraft.name,
          servings: 4,
        },
      },
      error: null,
    });

    const published = await publishRecipeDraft(db.client, userId, recipeId);

    expect(published).toMatchObject({
      recipeId,
      recipeVersionId: v2,
      versionNumber: 2,
      version: { id: v2, version_number: 2 },
    });
    expect(db.rpc).toHaveBeenCalledWith("publish_nutrition_recipe_draft", {
      p_recipe_id: recipeId,
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("propagates database-owned incomplete Working Draft rejection without direct published writes", async () => {
    const db = fakeSupabase({}, {
      data: null,
      error: { message: "Recipe Working Draft is not ready to publish.", code: "22023" },
    });

    await expect(publishRecipeDraft(db.client, userId, recipeId)).rejects.toThrow(/working draft.*not ready/i);
    expect(db.rpc).toHaveBeenCalledWith("publish_nutrition_recipe_draft", {
      p_recipe_id: recipeId,
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects malformed publication RPC responses instead of accepting uncertain publication state", async () => {
    const db = fakeSupabase({}, {
      data: { recipeId, recipeVersionId: v1, versionNumber: 1, version: { id: "wrong-id" } },
      error: null,
    });

    await expect(publishRecipeDraft(db.client, userId, recipeId)).rejects.toThrow(/invalid result/i);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("discards only the Working Draft", async () => {
    const draftDelete = query({ data: null, error: null });
    const db = fakeSupabase({ nutrition_recipe_drafts: [draftDelete] });

    await discardRecipeDraft(db.client, userId, recipeId);

    expect(draftDelete.delete).toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalledWith("nutrition_recipe_versions");
  });

  it("soft deletes and restores the same Recipe ID through owner-derived lifecycle RPCs", async () => {
    const deleted = fakeSupabase({}, { data: { id: recipeId, deletedAt: "2026-08-25T00:00:00Z", purgeAfter: "2026-09-24T00:00:00Z" }, error: null });
    expect((await softDeleteRecipe(deleted.client, recipeId)).id).toBe(recipeId);
    expect(deleted.rpc).toHaveBeenCalledWith("soft_delete_nutrition_recipe", { p_recipe_id: recipeId });

    const restored = fakeSupabase({}, { data: { id: recipeId, restored: true }, error: null });
    expect((await restoreRecipe(restored.client, recipeId)).id).toBe(recipeId);
    expect(restored.rpc).toHaveBeenCalledWith("restore_nutrition_recipe", { p_recipe_id: recipeId });
  });

  it("purges only through the reviewed Recipe lifecycle RPC", async () => {
    const db = fakeSupabase({}, { data: { id: recipeId, permanentlyDeleted: true }, error: null });
    expect((await purgeRecipeNow(db.client, recipeId)).id).toBe(recipeId);
    expect(db.rpc).toHaveBeenCalledWith("purge_nutrition_recipe_now", { p_recipe_id: recipeId });
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe("Nutrition V1 Recipe MCP write authority", () => {
  it("rejects direct mutation of a published Recipe version", () => {
    expect(() => normalizeRecipeMcpDraftMutation({ target: "published", recipe_version_id: v1, name: "Changed" })).toThrow(/working draft|published/i);
  });

  it("accepts only Draft authoring facts and never treats ChatGPT nutrient numbers as Plaivra nutrition authority", () => {
    const result = normalizeRecipeMcpDraftMutation({
      target: "working_draft",
      recipe_id: recipeId,
      name: "Chicken bowl",
      servings: 4,
      ingredients: [{ food_id: completeDraft.ingredients[0].food_id, ingredient_name: "Chicken", quantity: 500, unit: "g", calories: 9999, protein_g: 9999 }],
      instructions: completeDraft.instructions,
    });

    expect(result.target).toBe("working_draft");
    expect(result.ingredients[0]).not.toHaveProperty("calories");
    expect(result.ingredients[0]).not.toHaveProperty("protein_g");
  });

  it("reuses Nutrition permission for Draft writes and exposes no Recipe publish scope", () => {
    expect(MCP_RECIPE_SCOPES).toEqual({ read: MCP_SCOPES.nutritionRead, writeDraft: MCP_SCOPES.nutritionWrite });
    expect(MCP_RECIPE_SCOPES).not.toHaveProperty("publish");
  });

  it("keeps external ChatGPT Recipe flows Draft-only and Plaivra-authoritative", () => {
    expect(NUTRITION_RECIPE_EXTERNAL_PROMPTS.create).toMatchObject({ surface: "external_chatgpt", target: "new_draft", requiresExplicitApproval: true, nutrientAuthority: "plaivra" });
    expect(NUTRITION_RECIPE_EXTERNAL_PROMPTS.import).toMatchObject({ surface: "external_chatgpt", target: "new_draft", requiresExplicitApproval: true, nutrientAuthority: "plaivra" });
    expect(NUTRITION_RECIPE_EXTERNAL_PROMPTS.finish).toMatchObject({ surface: "external_chatgpt", target: "working_draft", requiresExplicitApproval: true, nutrientAuthority: "plaivra" });
    expect(Object.values(NUTRITION_RECIPE_EXTERNAL_PROMPTS).every((entry) => entry.publish === false)).toBe(true);

    for (const contract of Object.values(NUTRITION_RECIPE_EXTERNAL_CONTRACTS)) {
      expect(contract.constraints.map((item) => item.en).join(" ")).toMatch(/working draft/i);
      expect(contract.constraints.map((item) => item.en).join(" ")).toMatch(/Plaivra/i);
      expect(contract.output.length).toBeGreaterThanOrEqual(3);
    }
  });
});
