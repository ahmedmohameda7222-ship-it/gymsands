import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { autosaveRecipeDraft } from "@/services/nutrition-v1/server/recipes";

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Recipe Working Draft revision conflict taxonomy", () => {
  it("surfaces SQLSTATE 40001 as a stable conflict instead of generic unavailability", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        message: "Recipe Working Draft revision conflict.",
        code: "40001",
      },
    }));
    const client = { rpc } as unknown as SupabaseClient;

    const save = autosaveRecipeDraft(client, userId, recipeId, {
      name: "Newest local intent",
      servings: 2,
      ingredients: [],
      instructions: [],
      equipment: [],
    }, 4);

    await expect(save).rejects.toMatchObject({
      status: 409,
      code: "recipe_draft_revision_conflict",
    });
    expect(rpc).toHaveBeenCalledWith("autosave_nutrition_recipe_draft", expect.objectContaining({
      p_recipe_id: recipeId,
      p_expected_revision: 4,
    }));
  });
});
