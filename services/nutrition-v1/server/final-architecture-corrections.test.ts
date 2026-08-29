import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { startCookingSession } from "@/services/nutrition-v1/server/cooking-sessions";

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const versionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function nutritionMigrationText() {
  return readdirSync("supabase/migrations")
    .filter((name) => name.includes("nutrition_v1") && name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
    .join("\n")
    .replaceAll("\r\n", "\n")
    .toLowerCase();
}

describe("Nutrition V1 final long-term architecture corrections", () => {
  it("starts Cooking through one owner-derived transactional RPC without client-side partial writes", async () => {
    const frozenSnapshot = {
      schemaVersion: 1,
      recipe: { id: versionId, recipe_id: recipeId, user_id: userId, version_number: 1, name: "Atomic recipe", servings: 2 },
      ingredients: [],
      actions: [],
      equipment: [],
    };
    const session = {
      id: sessionId,
      user_id: userId,
      recipe_id: recipeId,
      recipe_version_id: versionId,
      frozen_recipe_snapshot: frozenSnapshot,
      serving_scale: 1,
      current_action_key: null,
      status: "active",
      started_at: "2026-08-28T03:00:00.000Z",
      last_active_at: "2026-08-28T03:00:00.000Z",
      completed_at: null,
      ended_at: null,
      state_revision: 0,
    };
    const rpc = vi.fn(async () => ({
      data: { sessionId, session, snapshot: frozenSnapshot, reused: false },
      error: null,
    }));
    const from = vi.fn(() => {
      throw new Error("Atomic Cooking start must not orchestrate table writes from the client.");
    });
    const client = { rpc, from } as unknown as SupabaseClient;

    const started = await startCookingSession(client, userId, {
      recipeId,
      recipeVersionId: versionId,
      servingScale: 1,
      now: "2026-08-28T03:00:00.000Z",
    });

    expect(started).toMatchObject({ sessionId, session: { id: sessionId }, snapshot: frozenSnapshot });
    expect(rpc).toHaveBeenCalledWith("start_nutrition_cooking_session", {
      p_recipe_id: recipeId,
      p_recipe_version_id: versionId,
      p_serving_scale: 1,
      p_now: "2026-08-28T03:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("defines a transactional idempotent Cooking-start database authority", () => {
    const migration = nutritionMigrationText();
    expect(migration).toContain("create or replace function public.start_nutrition_cooking_session");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("nutrition_cooking_action_states");
    expect(migration).toContain("jsonb_build_object('sessionid'");
    expect(migration).toContain("'reused', true");
  });

  it("prunes non-empty Food searches through trigram-indexable normalized candidate sets before heavy ranking", () => {
    const migration = nutritionMigrationText();
    expect(migration).toContain("nutrition_food_items_normalized_name_trgm_idx");
    expect(migration).toContain("nutrition_food_aliases_normalized_text_trgm_idx");
    expect(migration).toContain("catalog_name_matches as materialized");
    expect(migration).toContain("catalog_alias_matches as materialized");
    expect(migration).toContain("v_query <> ''");
    expect(migration).toContain("private.normalize_nutrition_food_search_text(food.food_name)");
    expect(migration).toContain("private.normalize_nutrition_food_search_text(alias.alias)");
  });
});
