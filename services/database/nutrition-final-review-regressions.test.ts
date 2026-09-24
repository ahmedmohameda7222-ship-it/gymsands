import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFoodId = "22222222-2222-4222-8222-222222222222";
const survivorFoodId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const db = vi.hoisted(() => {
  const userRows: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table !== "user_food_items") throw new Error(`Unexpected table ${table}`);
    const query: Record<string, unknown> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.order = vi.fn(async () => ({ data: [...userRows], error: null }));
    return query;
  });
  return {
    userRows,
    from,
    rpc: vi.fn(),
    getSession: vi.fn(async () => ({
      data: { session: { access_token: "test-token" } },
      error: null,
    })),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: db.from,
    rpc: db.rpc,
    auth: { getSession: db.getSession },
  },
}));

import {
  getCatalogNewUseSelection,
  getFoodLibrary,
  getGlobalFoods,
} from "@/services/database/nutrition";

function nutrition() {
  return {
    calories: 100,
    protein_g: 10,
    carbs_g: 5,
    fat_g: 2,
    saturated_fat_g: null,
    fiber_g: null,
    sugars_g: null,
    sodium_mg: null,
    basis_amount: 100,
    basis_unit: "g" as const,
  };
}

function catalogCandidate(id = originalFoodId) {
  return {
    id,
    source: "catalog" as const,
    name: "Redirectable yogurt",
    brand: null,
    category: "dairy",
    cuisine: null,
    servingLabel: null,
    verified: true,
    favorite: false,
    recentAt: null,
    frequency: 0,
    locale: "en",
    aliases: [],
    nutrition: nutrition(),
  };
}

function myFoodCandidate(index: number) {
  return {
    id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, "0")}`,
    source: "my_food" as const,
    name: `Personal Food ${index}`,
    brand: null,
    category: null,
    cuisine: null,
    servingLabel: "1 serving",
    verified: false,
    favorite: false,
    recentAt: null,
    frequency: 0,
    locale: "en",
    aliases: [],
    nutrition: nutrition(),
  };
}

describe("Plan 7 final browser Catalog review regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.userRows.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a current-generation survivor identity returned for a stale redirectable search result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      foodId: survivorFoodId,
      name: "Redirectable yogurt",
      languageTag: "en",
      servingChoices: [{
        servingOptionId: "33333333-3333-4333-8333-333333333333",
        label: "170 g",
        source: "generation",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const selection = await getCatalogNewUseSelection({
      id: originalFoodId,
      food_name: "Redirectable yogurt",
      locale: "en",
    });

    expect(selection.foodId).toBe(survivorFoodId);
  });

  it("continues mixed all-scope pagination beyond ten My Food-only pages until the requested Catalog target is reached", async () => {
    db.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      const cursor = typeof args.p_cursor === "string" ? Number(args.p_cursor) : 0;
      const catalogPage = cursor === 10;
      return {
        data: {
          items: catalogPage ? [catalogCandidate()] : [myFoodCandidate(cursor + 1)],
          nextCursor: catalogPage ? null : String(cursor + 1),
        },
        error: null,
      };
    });

    const foods = await getGlobalFoods("yogurt", { limit: 1 });

    expect(foods).toHaveLength(1);
    expect(foods[0]?.id).toBe(originalFoodId);
    expect(db.rpc).toHaveBeenCalledTimes(11);
    expect(db.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_cursor: "10", p_scope: "all" });
  });

  it("preserves a ranked My Food result when Catalog rows would otherwise fill the combined browser limit", async () => {
    const myFoodId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    db.userRows.push({
      id: myFoodId,
      user_id: "11111111-1111-4111-8111-111111111111",
      food_name: "Owner yogurt",
      serving_size: "2 tbsp",
      calories: 77,
      protein_g: 8,
      carbs_g: 4,
      fat_g: 3,
      category: "dairy",
      cuisine: null,
      kitchen_id: null,
      subcategory_id: null,
      fiber_g: null,
      sugar_g: null,
      sodium_mg: null,
      tags: [],
      notes: null,
    });
    const firstCatalog = Array.from({ length: 19 }, (_, index) => catalogCandidate(
      `d0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ));
    const laterCatalog = Array.from({ length: 5 }, (_, index) => catalogCandidate(
      `e0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ));
    db.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      if (args.p_cursor === null) {
        return {
          data: {
            items: [{
              ...myFoodCandidate(1),
              id: myFoodId,
              name: "Owner yogurt",
              servingLabel: "search-only serving",
            }, ...firstCatalog],
            nextCursor: "page-2",
          },
          error: null,
        };
      }
      return {
        data: { items: laterCatalog, nextCursor: null },
        error: null,
      };
    });

    const foods = await getFoodLibrary(
      "11111111-1111-4111-8111-111111111111",
      "",
      { limit: 24 },
    );

    expect(foods).toHaveLength(24);
    const ownerFood = foods.find((food) => food.id === myFoodId);
    expect(ownerFood).toMatchObject({
      id: myFoodId,
      is_global: false,
      serving_size: "2 tbsp",
      calories: 77,
    });
    expect(foods.findIndex((food) => food.id === myFoodId)).toBe(0);
  });

  it("keeps a Catalog result that V2 matched through an alias even when its selected display name does not contain the query", async () => {
    db.rpc.mockResolvedValue({
      data: {
        items: [{
          ...catalogCandidate(),
          name: "Yogurt",
          aliases: [{ locale: "de", value: "Joghurt" }],
        }],
        nextCursor: null,
      },
      error: null,
    });

    const foods = await getFoodLibrary(
      "11111111-1111-4111-8111-111111111111",
      "joghurt",
      { limit: 12 },
    );

    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({
      id: originalFoodId,
      food_name: "Yogurt",
      is_global: true,
    });
  });
});
