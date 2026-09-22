import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFoodId = "22222222-2222-4222-8222-222222222222";
const survivorFoodId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(async () => ({
    data: { session: { access_token: "test-token" } },
    error: null,
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc: db.rpc,
    auth: { getSession: db.getSession },
  },
}));

import {
  getCatalogNewUseSelection,
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
});
