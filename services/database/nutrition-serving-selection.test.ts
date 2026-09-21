import { beforeEach, describe, expect, it, vi } from "vitest";

const foodId = "22222222-2222-4222-8222-222222222222";
const servingId = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => {
  const inserted: Array<Record<string, unknown>> = [];
  const single = vi.fn(async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ...(inserted.at(-1) ?? {}) }, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn((payload: Record<string, unknown>) => { inserted.push(payload); return { select }; });
  const from = vi.fn((table: string) => {
    if (table !== "food_logs") throw new Error(`Unexpected table ${table}`);
    return { insert };
  });
  const getSession = vi.fn(async () => ({ data: { session: { access_token: "test-token" } }, error: null }));
  const rpc = vi.fn(async () => ({
    data: {
      items: [{
        id: foodId,
        source: "catalog",
        name: "Catalog yogurt",
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
        nutrition: {
          calories: 100,
          protein_g: 10,
          carbs_g: 5,
          fat_g: 2,
          saturated_fat_g: null,
          fiber_g: null,
          sugars_g: null,
          sodium_mg: null,
          basis_amount: 100,
          basis_unit: "g",
        },
      }],
      nextCursor: null,
    },
    error: null,
  }));
  return { inserted, single, select, insert, from, getSession, rpc };
});

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: db.from, rpc: db.rpc, auth: { getSession: db.getSession } },
}));

import { addGlobalFoodToToday, getGlobalFoods, withCatalogServingChoice } from "@/services/database/nutrition";

describe("Plan 7 browser Catalog serving selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.inserted.length = 0;
  });

  it("keeps SearchDocument serving NULL Food discoverable instead of manufacturing nutrition basis as serving", async () => {
    const foods = await getGlobalFoods("yogurt", { limit: 1 });
    expect(foods).toHaveLength(1);
    expect(foods[0]?.food_name).toBe("Catalog yogurt");
    expect(foods[0]?.serving_size).toBe("");
    expect(foods[0]?.calories).toBe(100);
  });

  it("auto-selects the one authoritative generation serving before Diary handoff and carries servingOptionId", async () => {
    const [food] = await getGlobalFoods("yogurt", { limit: 1 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        foodId,
        name: "Catalog yogurt",
        languageTag: "en",
        servingChoices: [{ servingOptionId: servingId, label: "170 g", source: "generation" }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        foodId,
        source: "catalog",
        name: "Catalog yogurt",
        serving: "170 g",
        quantity: 1,
        frozenNutrition: { calories: 100, protein_g: 10, carbs_g: 5, fat_g: 2, fiber_g: null },
        diaryItem: {
          foodName: "Catalog yogurt",
          servingLabel: "170 g",
          quantity: 1,
          nutrition: { caloriesKcal: 100, proteinG: 10, carbsG: 5, fatG: 2 },
          foodItemId: foodId,
          userFoodItemId: null,
        },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await addGlobalFoodToToday({ userId, food: food!, quantity: 1, mealType: "Lunch", date: "2026-09-21" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/api/nutrition/v1/foods/${foodId}/selection?`);
    const handoffUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), "http://localhost");
    expect(handoffUrl.searchParams.get("serving")).toBe("170 g");
    expect(handoffUrl.searchParams.get("servingOptionId")).toBe(servingId);
    expect(db.inserted[0]).toMatchObject({ serving_size: "170 g", food_item_id: foodId });
  });

  it("refuses to choose arbitrarily when multiple authoritative generation servings exist", async () => {
    const [food] = await getGlobalFoods("yogurt", { limit: 1 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      foodId,
      name: "Catalog yogurt",
      languageTag: "en",
      servingChoices: [
        { servingOptionId: servingId, label: "170 g", source: "generation" },
        { servingOptionId: "44444444-4444-4444-8444-444444444444", label: "1 cup", source: "generation" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(addGlobalFoodToToday({ userId, food: food!, quantity: 1 })).rejects.toThrow(/choose.*serving/i);
    expect(db.inserted).toHaveLength(0);
  });

  it("rejects new use when zero authoritative servings exist without fabricating 100 g or 1 serving", async () => {
    const [food] = await getGlobalFoods("yogurt", { limit: 1 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      foodId,
      name: "Catalog yogurt",
      languageTag: "en",
      servingChoices: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(addGlobalFoodToToday({ userId, food: food!, quantity: 1 })).rejects.toThrow(/no authoritative serving/i);
    expect(db.inserted).toHaveLength(0);
  });

  it("projects the exact selected serving nutrition into the browser Food preview", async () => {
    const [food] = await getGlobalFoods("yogurt", { limit: 1 });
    const projected = withCatalogServingChoice(food!, {
      servingOptionId: servingId,
      label: "1 cup",
      source: "generation",
      nutrition: {
        calories: 240,
        protein_g: 24,
        carbs_g: 12,
        fat_g: 4.8,
        saturated_fat_g: null,
        fiber_g: 2,
        sugars_g: null,
        sodium_mg: null,
        basis_amount: 1,
        basis_unit: "serving",
      },
    } as unknown as Parameters<typeof withCatalogServingChoice>[1]);

    expect(projected).toMatchObject({
      serving_size: "1 cup",
      serving_option_id: servingId,
      calories: 240,
      protein_g: 24,
      carbs_g: 12,
      fat_g: 4.8,
      fiber_g: 2,
    });
  });

});
