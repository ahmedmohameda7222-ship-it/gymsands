import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listRecipeHome } from "@/services/nutrition-v1/server/recipe-workspace";

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "22222222-2222-4222-8222-222222222222";
const draftId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";

function query(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "limit", "ilike", "in"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return chain;
}

describe("Recipe home published projection", () => {
  it("keeps the latest published version usable and prevents Working Draft fields from leaking into published consumers", async () => {
    const roots = query([{ id: recipeId, user_id: userId, name: "Root name", is_favorite: false, cover_path: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-28T00:00:00Z", deleted_at: null, purge_after: null }]);
    const drafts = query([{ id: draftId, recipe_id: recipeId, user_id: userId, base_recipe_version_id: versionId, name: "Unpublished secret name", servings: 99, total_cooked_weight_g: null, total_time_minutes: 999, notes: null, draft_metadata: { cuisine: "Draft cuisine", nutrition_per_serving: { calories: 999, protein_g: 99, carbs_g: 99, fat_g: 99 } }, created_at: "2026-08-28T00:00:00Z", updated_at: "2026-08-28T01:00:00Z" }]);
    const versions = query([{ id: versionId, recipe_id: recipeId, user_id: userId, version_number: 7, name: "Published canonical name", servings: 2, total_cooked_weight_g: null, total_time_minutes: 30, notes: null, metadata: { cuisine: "Published cuisine", nutrition_per_serving: { calories: 410, protein_g: 32, carbs_g: 44, fat_g: 12 } }, published_at: "2026-08-27T00:00:00Z", created_at: "2026-08-27T00:00:00Z" }]);
    const usage = query([]);
    const from = vi.fn((table: string) => {
      if (table === "nutrition_recipes") return roots;
      if (table === "nutrition_recipe_drafts") return drafts;
      if (table === "nutrition_recipe_versions") return versions;
      if (table === "nutrition_log_groups") return usage;
      throw new Error(`Unexpected table ${table}`);
    });

    const records = await listRecipeHome({ from } as unknown as SupabaseClient, userId, { limit: 10 });

    expect(records).toEqual([expect.objectContaining({
      recipeId,
      status: "published",
      draftId,
      draftUpdatedAt: "2026-08-28T01:00:00Z",
      recipeVersionId: versionId,
      versionNumber: 7,
      name: "Published canonical name",
      servings: 2,
      totalTimeMinutes: 30,
      cuisine: "Published cuisine",
      nutritionPerServing: { calories: 410, protein_g: 32, carbs_g: 44, fat_g: 12 },
    })]);
    expect(records[0]?.name).not.toContain("secret");
  });
});
