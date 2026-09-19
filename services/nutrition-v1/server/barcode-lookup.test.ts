import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFoodBarcode } from "@/services/nutrition-v1/server/barcode-lookup";

const generation = vi.hoisted(() => ({
  resolve: vi.fn(),
}));
const search = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("@/services/food-catalog/server/current-generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/food-catalog/server/current-generation-service")>(
    "@/services/food-catalog/server/current-generation-service",
  );
  return {
    ...actual,
    resolveCurrentGenerationFoodForNewUseFromSupabase: generation.resolve,
  };
});
vi.mock("@/services/nutrition-v1/server/food-library", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/food-library")>(
    "@/services/nutrition-v1/server/food-library",
  );
  return { ...actual, listFoodLibrary: search.list };
});

const userId = "11111111-1111-4111-8111-111111111111";
const mappedFoodId = "22222222-2222-4222-8222-222222222222";
const survivorId = "33333333-3333-4333-8333-333333333333";
const nameId = "44444444-4444-4444-8444-444444444444";
const barcode = "4006381333931";

function supabaseWithBarcode(data: unknown) {
  const rpc = vi.fn(async (name: string) => {
    if (name !== "food_catalog_lookup_effective_barcode") throw new Error(`Unexpected RPC ${name}`);
    return { data, error: null };
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

function currentView(overrides: Record<string, unknown> = {}) {
  return {
    requestedFoodId: mappedFoodId,
    resolvedFoodId: survivorId,
    food: { lifecycle: "active" },
    selections: { nameFactIds: [nameId] },
    names: [{
      id: nameId,
      foodId: survivorId,
      role: "preferred_display",
      languageTag: "en",
      text: "Canonical yogurt",
    }],
    ...overrides,
  };
}

function candidate() {
  return {
    id: survivorId,
    source: "catalog",
    name: "Canonical yogurt",
    brand: null,
    category: null,
    cuisine: null,
    servingLabel: "170 g",
    verified: true,
    favorite: false,
    recentAt: null,
    frequency: 0,
    locale: "en",
    aliases: [],
    nutrition: {
      calories: 100,
      protein_g: 10,
      carbs_g: null,
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

describe("Task 12 canonical-first barcode resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generation.resolve.mockResolvedValue(currentView());
    search.list.mockResolvedValue({ items: [candidate()], nextCursor: null });
  });

  it("normalizes and validates GTIN before consulting canonical authority", async () => {
    const db = supabaseWithBarcode([]);
    const provider = vi.fn();

    await expect(resolveFoodBarcode(db.client, userId, "123", "en", provider)).rejects.toThrow(/barcode/i);

    expect(db.rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses the local effective barcode mapping and current survivor without calling the provider", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    const provider = vi.fn();

    const result = await resolveFoodBarcode(db.client, userId, barcode, "en", provider);

    expect(result).toEqual({ kind: "catalog", barcode, food: candidate() });
    expect(db.rpc).toHaveBeenCalledWith("food_catalog_lookup_effective_barcode", { p_gtin: barcode });
    expect(generation.resolve).toHaveBeenCalledWith(db.client, mappedFoodId);
    expect(search.list).toHaveBeenCalledWith(db.client, userId, expect.objectContaining({
      query: "Canonical yogurt",
      locale: "en",
      limit: 20,
      scope: "all",
    }));
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses the flattened current-generation survivor rather than the mapped historical identity", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    const provider = vi.fn();

    const result = await resolveFoodBarcode(db.client, userId, barcode, "en", provider);

    expect(result.kind).toBe("catalog");
    if (result.kind === "catalog") expect(result.food.id).toBe(survivorId);
    expect(result.kind === "catalog" && result.food.id).not.toBe(mappedFoodId);
  });

  it("calls the provider only on an exact canonical miss and marks the result as a suggestion", async () => {
    const db = supabaseWithBarcode([]);
    const providerFood = { source: "open_food_facts", barcode, name: "Provider yogurt" };
    const provider = vi.fn(async () => providerFood);

    const result = await resolveFoodBarcode(db.client, userId, barcode, "en", provider);

    expect(result).toEqual({ kind: "provider_suggestion", barcode, food: providerFood });
    expect(provider).toHaveBeenCalledWith(barcode);
    expect(generation.resolve).not.toHaveBeenCalled();
    expect(search.list).not.toHaveBeenCalled();
  });

  it("does not let provider lookup override an inactive or otherwise rejected canonical mapping", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    generation.resolve.mockRejectedValueOnce(new Error("Only active current-generation Foods may be selected for new use."));
    const provider = vi.fn();

    await expect(resolveFoodBarcode(db.client, userId, barcode, "en", provider)).rejects.toThrow(/active current-generation/i);

    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects ambiguous effective barcode mappings instead of choosing one", async () => {
    const db = supabaseWithBarcode([
      { barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode },
      { barcode_id: "66666666-6666-4666-8666-666666666666", food_id: survivorId, gtin: barcode },
    ]);
    const provider = vi.fn();

    await expect(resolveFoodBarcode(db.client, userId, barcode, "en", provider)).rejects.toThrow(/exactly one/i);
    expect(provider).not.toHaveBeenCalled();
  });

  it("requires one selected localized preferred Name and exact V2 candidate identity", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    generation.resolve.mockResolvedValueOnce(currentView({
      selections: { nameFactIds: [nameId, "77777777-7777-4777-8777-777777777777"] },
      names: [
        currentView().names[0],
        { id: "77777777-7777-4777-8777-777777777777", foodId: survivorId, role: "preferred_display", languageTag: "en", text: "Second name" },
      ],
    }));
    const provider = vi.fn();

    await expect(resolveFoodBarcode(db.client, userId, barcode, "en", provider)).rejects.toThrow(/display name/i);
    expect(provider).not.toHaveBeenCalled();

    generation.resolve.mockResolvedValueOnce(currentView());
    search.list.mockResolvedValueOnce({ items: [{ ...candidate(), id: mappedFoodId }], nextCursor: null });
    await expect(resolveFoodBarcode(db.client, userId, barcode, "en", provider)).rejects.toThrow(/presentation/i);
    expect(provider).not.toHaveBeenCalled();
  });
});
