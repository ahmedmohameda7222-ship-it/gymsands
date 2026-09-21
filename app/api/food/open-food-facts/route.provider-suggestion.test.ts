import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const barcode = "4006381333931";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireEligibleUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  resolveFoodBarcode: vi.fn(),
  resolveFoodHandoff: vi.fn(),
  logExternalApi: vi.fn(),
  lookupOpenFoodFactsBarcode: vi.fn(),
}));

vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/integrations/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/env")>("@/lib/integrations/env");
  return { ...actual, requireEligibleUser: mocks.requireEligibleUser, createSupabaseServerClient: mocks.createSupabaseServerClient };
});
vi.mock("@/lib/integrations/api-logger", () => ({ logExternalApi: mocks.logExternalApi }));
vi.mock("@/lib/integrations/open-food-facts", () => ({ lookupOpenFoodFactsBarcode: mocks.lookupOpenFoodFactsBarcode }));
vi.mock("@/services/nutrition-v1/server/barcode-lookup", () => ({ resolveFoodBarcode: mocks.resolveFoodBarcode }));
vi.mock("@/services/nutrition-v1/server/food-handoff", () => ({
  resolveFoodHandoffWithAuthorities: mocks.resolveFoodHandoff,
}));

import { GET, POST } from "@/app/api/food/open-food-facts/route";

function ownerSupabase() {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "insert", "update"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  query.single = vi.fn(async () => ({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null }));
  return { from: vi.fn(() => query) };
}

const providerSuggestion = () => ({
  kind: "provider_suggestion" as const,
  barcode,
  food: {
    source: "open_food_facts",
    source_id: barcode,
    barcode,
    name: "Provider yogurt",
    brand: "Provider",
    serving_size: "170 g",
    calories: 100,
    protein: 10,
    carbs: 12,
    fat: 2,
    fiber: null,
    sugar: null,
    sodium: null,
  },
});

const catalogFoodId = "33333333-3333-4333-8333-333333333333";
const servingA = "44444444-4444-4444-8444-444444444444";
const servingB = "55555555-5555-4555-8555-555555555555";

function catalogResult(servingChoices: Array<{ servingOptionId: string | null; label: string; source: "generation" | "owner_override" }>) {
  return {
    kind: "catalog" as const,
    barcode,
    food: {
      id: catalogFoodId,
      source: "catalog" as const,
      name: "Canonical yogurt",
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
        carbs_g: 12,
        fat_g: 2,
        saturated_fat_g: null,
        fiber_g: null,
        sugars_g: null,
        sodium_mg: null,
        basis_amount: 100,
        basis_unit: "g" as const,
      },
    },
    selection: {
      foodId: catalogFoodId,
      name: "Canonical yogurt",
      languageTag: "en",
      servingChoices,
    },
  };
}

function handoffResult(serving: string) {
  return {
    foodId: catalogFoodId,
    source: "catalog",
    name: "Canonical yogurt",
    serving,
    quantity: 1,
    frozenNutrition: { calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2, fiber_g: null },
    diaryItem: {
      foodName: "Canonical yogurt",
      servingLabel: serving,
      quantity: 1,
      nutrition: { caloriesKcal: 100, proteinG: 10, carbsG: 12, fatG: 2 },
      foodItemId: catalogFoodId,
      userFoodItemId: null,
    },
  };
}

describe("Task 12 barcode provider suggestion policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.createSupabaseServerClient.mockReturnValue({ authority: "catalog" });
    mocks.logExternalApi.mockResolvedValue(undefined);
    mocks.resolveFoodHandoff.mockResolvedValue(handoffResult("170 g"));
  });

  it("keeps canonical-miss provider data readable as suggestion evidence", async () => {
    const db = ownerSupabase();
    mocks.requireEligibleUser.mockResolvedValue({ supabase: db, user: { id: ownerId }, accessToken: "token" });
    mocks.resolveFoodBarcode.mockResolvedValueOnce(providerSuggestion());

    const response = await GET(new Request(`http://localhost/api/food/open-food-facts?barcode=${barcode}&locale=en`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "provider_suggestion",
      food: { source: "provider_suggestion", name: "Provider yogurt" },
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects direct provider-suggestion mutation without writing owner data", async () => {
    const db = ownerSupabase();
    mocks.requireEligibleUser.mockResolvedValue({ supabase: db, user: { id: ownerId }, accessToken: "token" });
    mocks.resolveFoodBarcode.mockResolvedValueOnce(providerSuggestion());

    const response = await POST(new Request("http://localhost/api/food/open-food-facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        barcode,
        saveToLibrary: true,
        addToLog: true,
        addToMealPlan: true,
        quantity: 1,
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/suggestion/i) });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects canonical barcode new use when zero authoritative servings exist", async () => {
    const db = ownerSupabase();
    mocks.requireEligibleUser.mockResolvedValue({ supabase: db, user: { id: ownerId }, accessToken: "token" });
    mocks.resolveFoodBarcode.mockResolvedValueOnce(catalogResult([]));

    const response = await POST(new Request("http://localhost/api/food/open-food-facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ barcode, quantity: 1 }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/no authoritative serving/i) });
    expect(mocks.resolveFoodHandoff).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("auto-selects the sole canonical barcode serving and carries its exact generation identity", async () => {
    const db = ownerSupabase();
    mocks.requireEligibleUser.mockResolvedValue({ supabase: db, user: { id: ownerId }, accessToken: "token" });
    mocks.resolveFoodBarcode.mockResolvedValueOnce(catalogResult([
      { servingOptionId: servingA, label: "170 g", source: "generation" },
    ]));

    const response = await POST(new Request("http://localhost/api/food/open-food-facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ barcode, quantity: 1 }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.resolveFoodHandoff).toHaveBeenCalledWith(
      db,
      { authority: "catalog" },
      ownerId,
      expect.objectContaining({
        foodId: catalogFoodId,
        serving: "170 g",
        servingOptionId: servingA,
        languageTag: "en",
      }),
    );
    expect(db.from).not.toHaveBeenCalled();
  });

  it("requires explicit serving choice for canonical barcode Foods with multiple authoritative servings", async () => {
    const db = ownerSupabase();
    mocks.requireEligibleUser.mockResolvedValue({ supabase: db, user: { id: ownerId }, accessToken: "token" });
    mocks.resolveFoodBarcode.mockResolvedValueOnce(catalogResult([
      { servingOptionId: servingA, label: "170 g", source: "generation" },
      { servingOptionId: servingB, label: "1 cup", source: "generation" },
    ]));

    const response = await POST(new Request("http://localhost/api/food/open-food-facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ barcode, quantity: 1 }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/choose.*serving/i) });
    expect(mocks.resolveFoodHandoff).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

});
