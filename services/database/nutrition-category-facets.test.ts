import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } }, error: null })),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { rpc: db.rpc, auth: { getSession: db.getSession } },
}));

import { getFoodCategories, getGlobalFoods } from "@/services/database/nutrition";

function candidate(index: number, category: string) {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    source: "catalog",
    name: `Food ${index}`,
    brand: null,
    category,
    cuisine: null,
    servingLabel: "100 g",
    verified: true,
    locale: "en",
    nutrition: {
      calories: 100,
      protein_g: 10,
      carbs_g: 10,
      fat_g: 2,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 100,
      basis_unit: "g",
    },
  };
}

describe("Plan 7 browser category facet enumeration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads category facets through the authenticated categories endpoint instead of direct V2 search", async () => {
    db.rpc.mockImplementation(async () => {
      throw new Error("Category facet enumeration must not call search_food_catalog_v2.");
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      categories: [" fruit ", "dairy", "fruit", "", "   "],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getFoodCategories()).resolves.toEqual(["dairy", "fruit"]);

    expect(db.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/nutrition/v1/foods/categories",
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed category endpoint payloads instead of inventing fallback categories", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      categories: ["fruit", 42],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(getFoodCategories()).rejects.toThrow(/invalid response/i);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("keeps ordinary global Food query/category search on search_food_catalog_v2", async () => {
    db.rpc.mockResolvedValue({
      data: { items: [candidate(1, "fruit")], nextCursor: null },
      error: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const foods = await getGlobalFoods("apple", { category: "fruit", limit: 1 });

    expect(foods).toHaveLength(1);
    expect(db.rpc).toHaveBeenCalledWith("search_food_catalog_v2", expect.objectContaining({
      p_query: "apple",
      p_category: "fruit",
      p_limit: 1,
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
