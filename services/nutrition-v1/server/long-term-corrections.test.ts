import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listFoodLibrary } from "@/services/nutrition-v1/server/food-library";
import { startOverCookingSession } from "@/services/nutrition-v1/server/cooking-sessions";
import { createRecipeDraft } from "@/services/nutrition-v1/server/recipes";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const restartedSessionId = "33333333-3333-4333-8333-333333333333";
const recipeId = "44444444-4444-4444-8444-444444444444";
const draftId = "55555555-5555-4555-8555-555555555555";

function rpcClient(
  implementation: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null | { message: string; code?: string } }>,
) {
  const rpc = vi.fn(implementation);
  const from = vi.fn(() => {
    throw new Error("Long-term Nutrition commands must not use multi-write table orchestration.");
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

describe("Nutrition V1 long-term architecture corrections", () => {
  it("pages the authoritative Food Library through one database search command, including a match beyond the old 80-row boundary", async () => {
    const pages = new Map<string, unknown>([
      ["first", {
        items: Array.from({ length: 20 }, (_, index) => ({
          id: `catalog-${String(index + 1).padStart(3, "0")}`,
          source: "catalog",
          name: `Catalog Food ${String(index + 1).padStart(3, "0")}`,
          brand: null,
          category: "Protein",
          cuisine: "Test",
          servingLabel: "100 g",
          verified: false,
          favorite: false,
          recentAt: null,
          frequency: 0,
          locale: "en",
          aliases: [],
          nutrition: {
            calories: 100,
            protein_g: 25,
            carbs_g: 4,
            fat_g: 2,
            saturated_fat_g: null,
            fiber_g: null,
            sugars_g: null,
            sodium_mg: null,
            basis_amount: 100,
            basis_unit: "g",
          },
          tags: [],
          usingPersonalValues: false,
        })),
        nextCursor: "cursor-after-20",
      }],
      ["cursor-after-20", {
        items: [{
          id: "catalog-081",
          source: "catalog",
          name: "Target Beyond Eighty",
          brand: null,
          category: "Protein",
          cuisine: "Test",
          servingLabel: "100 g",
          verified: true,
          favorite: false,
          recentAt: null,
          frequency: 0,
          locale: "en",
          aliases: [],
          nutrition: {
            calories: 120,
            protein_g: 26,
            carbs_g: 3,
            fat_g: 2,
            saturated_fat_g: null,
            fiber_g: null,
            sugars_g: null,
            sodium_mg: null,
            basis_amount: 100,
            basis_unit: "g",
          },
          tags: ["fixture"],
          usingPersonalValues: false,
        }],
        nextCursor: null,
      }],
    ]);
    const db = rpcClient(async (name, args) => {
      expect(name).toBe("search_food_catalog_v2");
      const cursor = typeof args.p_cursor === "string" && args.p_cursor ? args.p_cursor : "first";
      return { data: pages.get(cursor) ?? null, error: null };
    });

    const first = await listFoodLibrary(db.client, userId, { category: "Protein", protein: { operator: "gte", value: 20 } });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBe("cursor-after-20");

    const second = await listFoodLibrary(db.client, userId, {
      category: "Protein",
      protein: { operator: "gte", value: 20 },
      cursor: first.nextCursor,
    });
    expect(second.items.map((item) => item.id)).toContain("catalog-081");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("performs Cooking Start Over through exactly one transactional RPC", async () => {
    const db = rpcClient(async (name, args) => {
      expect(name).toBe("start_over_nutrition_cooking_session");
      expect(args).toMatchObject({ p_session_id: sessionId });
      return { data: { sessionId: restartedSessionId }, error: null };
    });

    await expect(startOverCookingSession(db.client, userId, sessionId, "2026-08-27T10:00:00.000Z"))
      .resolves.toEqual({ sessionId: restartedSessionId });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("surfaces Start Over failure without falling back to partial durable writes", async () => {
    const db = rpcClient(async () => ({ data: null, error: { message: "Injected replacement-state failure", code: "23514" } }));

    await expect(startOverCookingSession(db.client, userId, sessionId)).rejects.toThrow(/replacement-state failure/i);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("creates the initial Recipe root and Working Draft through exactly one transactional RPC", async () => {
    const db = rpcClient(async (name, args) => {
      expect(name).toBe("create_nutrition_recipe_draft");
      expect(args).toMatchObject({ p_name: "Atomic recipe" });
      return {
        data: {
          recipeId,
          draftId,
          recipe: { id: recipeId, user_id: userId, name: "Atomic recipe" },
          draft: { id: draftId, recipe_id: recipeId, user_id: userId, name: "Atomic recipe" },
        },
        error: null,
      };
    });

    const created = await createRecipeDraft(db.client, userId, { name: "Atomic recipe" });
    expect(created).toMatchObject({ recipeId, draftId });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("cannot leave a Recipe root behind when initial Working Draft creation fails", async () => {
    const db = rpcClient(async () => ({ data: null, error: { message: "Injected initial draft failure", code: "23514" } }));

    await expect(createRecipeDraft(db.client, userId, { name: "Atomic recipe" })).rejects.toThrow(/initial draft failure/i);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.from).not.toHaveBeenCalled();
  });
});
