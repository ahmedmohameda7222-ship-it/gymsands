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
const servingId = "88888888-8888-4888-8888-888888888888";
const barcode = "4006381333931";
const catalogSupabase = { authority: "catalog" } as unknown as SupabaseClient;

function supabaseWithBarcode(data: unknown) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === "food_catalog_lookup_effective_barcode") return { data, error: null };
    if (name === "food_catalog_get_current_personal_override_v1") {
      return {
        data: {
          foodId: String(args?.p_food_id ?? survivorId),
          hasOverride: false,
          revisionId: null,
          pointerRevision: 0,
          isDeleted: false,
          nutritionOverride: null,
          servingLabel: null,
          note: null,
        },
        error: null,
      };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

function currentView(overrides: Record<string, unknown> = {}) {
  const overrideSelections = overrides.selections && typeof overrides.selections === "object"
    ? overrides.selections as Record<string, unknown>
    : {};
  return {
    requestedFoodId: mappedFoodId,
    resolvedFoodId: survivorId,
    food: { lifecycle: "active" },
    servingOptions: [{
      id: servingId,
      foodId: survivorId,
      label: "170 g",
    }],
    names: [{
      id: nameId,
      foodId: survivorId,
      role: "preferred_display",
      languageTag: "en",
      text: "Canonical yogurt",
    }],
    ...overrides,
    selections: {
      servingOptionIds: [servingId],
      nameFactIds: [nameId],
      taxonomyAssignmentIds: [],
      marketAssignmentIds: [],
      verification: [],
      ...overrideSelections,
    },
    nutritionRevision: {
      id: "90000000-0000-4000-8000-000000000001",
      foodId: survivorId,
      revisionNumber: 1,
      calories: 100,
      protein_g: 10,
      carbs_g: null,
      fat_g: 2,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basisAmount: 100,
      basisUnit: "g",
      nutrientMappingVersion: "map-v1",
      sourceRecordId: null,
      createdAt: "2026-09-21T00:00:00.000Z",
    },
    trust: { verified: true },
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

function preferredName(id: string, languageTag: string, text = `Canonical yogurt ${languageTag}`) {
  return {
    id,
    foodId: survivorId,
    role: "preferred_display",
    languageTag,
    text,
  };
}

function viewWithPreferredNames(entries: Array<{ id: string; languageTag: string; text?: string }>) {
  const names = entries.map((entry) => preferredName(entry.id, entry.languageTag, entry.text));
  return currentView({
    selections: { nameFactIds: names.map((name) => name.id) },
    names,
  });
}

function catalogCandidate(locale: string, name: string) {
  return { ...candidate(), locale, name };
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

    await expect(resolveFoodBarcode(db.client, catalogSupabase, userId, "123", "en", provider)).rejects.toThrow(/barcode/i);

    expect(db.rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses the local effective barcode mapping and current survivor without calling the provider", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    const provider = vi.fn();

    const result = await resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "en", provider);

    expect(result).toEqual({
      kind: "catalog",
      barcode,
      food: candidate(),
      selection: {
        foodId: survivorId,
        name: "Canonical yogurt",
        languageTag: "en",
        servingChoices: [{ servingOptionId: servingId, label: "170 g", source: "generation" }],
      },
    });
    expect(db.rpc).toHaveBeenCalledWith("food_catalog_lookup_effective_barcode", { p_gtin: barcode });
    expect(generation.resolve).toHaveBeenCalledWith(catalogSupabase, mappedFoodId);
    expect(search.list).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses the flattened current-generation survivor rather than the mapped historical identity", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    const provider = vi.fn();

    const result = await resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "en", provider);

    expect(result.kind).toBe("catalog");
    if (result.kind === "catalog") expect(result.food.id).toBe(survivorId);
    expect(result.kind === "catalog" && result.food.id).not.toBe(mappedFoodId);
  });

  it("calls the provider only on an exact canonical miss and marks the result as a suggestion", async () => {
    const db = supabaseWithBarcode([]);
    const providerFood = { source: "open_food_facts", barcode, name: "Provider yogurt" };
    const provider = vi.fn(async () => providerFood);

    const result = await resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "en", provider);

    expect(result).toEqual({ kind: "provider_suggestion", barcode, food: providerFood });
    expect(provider).toHaveBeenCalledWith(barcode);
    expect(generation.resolve).not.toHaveBeenCalled();
    expect(search.list).not.toHaveBeenCalled();
  });

  it("does not let provider lookup override an inactive or otherwise rejected canonical mapping", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    generation.resolve.mockRejectedValueOnce(new Error("Only active current-generation Foods may be selected for new use."));
    const provider = vi.fn();

    await expect(resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "en", provider)).rejects.toThrow(/active current-generation/i);

    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects ambiguous effective barcode mappings instead of choosing one", async () => {
    const db = supabaseWithBarcode([
      { barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode },
      { barcode_id: "66666666-6666-4666-8666-666666666666", food_id: survivorId, gtin: barcode },
    ]);
    const provider = vi.fn();

    await expect(resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "en", provider)).rejects.toThrow(/exactly one/i);
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

    await expect(resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "en", provider)).rejects.toThrow(/display name/i);
    expect(provider).not.toHaveBeenCalled();

    expect(search.list).not.toHaveBeenCalled();
  });

  it.each([
    {
      request: "en-GB",
      names: [
        { id: "70000000-0000-4000-8000-000000000001", languageTag: "en" },
        { id: "70000000-0000-4000-8000-000000000002", languageTag: "de" },
        { id: "70000000-0000-4000-8000-000000000003", languageTag: "ar" },
      ],
      expectedLocale: "en",
    },
    {
      request: "de-DE",
      names: [
        { id: "70000000-0000-4000-8000-000000000004", languageTag: "de" },
        { id: "70000000-0000-4000-8000-000000000005", languageTag: "en" },
      ],
      expectedLocale: "de",
    },
    {
      request: "ar-EG",
      names: [
        { id: "70000000-0000-4000-8000-000000000006", languageTag: "ar" },
        { id: "70000000-0000-4000-8000-000000000007", languageTag: "en" },
      ],
      expectedLocale: "ar",
    },
    {
      request: "en-US",
      names: [
        { id: "70000000-0000-4000-8000-000000000008", languageTag: "en-US" },
        { id: "70000000-0000-4000-8000-000000000009", languageTag: "en" },
      ],
      expectedLocale: "en-US",
    },
    {
      request: "en-AU",
      names: [
        { id: "70000000-0000-4000-8000-000000000010", languageTag: "en-US" },
      ],
      expectedLocale: "en-US",
    },
    {
      request: "fr-FR",
      names: [
        { id: "70000000-0000-4000-8000-000000000011", languageTag: "de" },
      ],
      expectedLocale: "de",
    },
  ])("selects barcode preferred Name locale for $request as $expectedLocale and uses it for V2 presentation", async ({ request, names, expectedLocale }) => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    const view = viewWithPreferredNames(names);
    generation.resolve.mockResolvedValueOnce(view);
    const selected = view.names.find((name) => name.languageTag === expectedLocale)!;
    search.list.mockResolvedValueOnce({ items: [catalogCandidate(expectedLocale, selected.text)], nextCursor: null });

    const result = await resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, request, vi.fn());

    expect(result.kind).toBe("catalog");
    if (result.kind !== "catalog") throw new Error("Expected canonical Catalog barcode result.");
    expect(result.food).toMatchObject({ id: survivorId, name: selected.text, locale: expectedLocale, servingLabel: null });
    expect(search.list).not.toHaveBeenCalled();
  });

  it("rejects ambiguous base-language family fallback instead of choosing between regional Names", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    generation.resolve.mockResolvedValueOnce(viewWithPreferredNames([
      { id: "70000000-0000-4000-8000-000000000012", languageTag: "en-US" },
      { id: "70000000-0000-4000-8000-000000000013", languageTag: "en-GB" },
    ]));

    await expect(resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "en-AU", vi.fn())).rejects.toThrow(/display name|ambiguous/i);
    expect(search.list).not.toHaveBeenCalled();
  });

  it("rejects multiple unrelated preferred Names when no locale-compatible Name exists", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    generation.resolve.mockResolvedValueOnce(viewWithPreferredNames([
      { id: "70000000-0000-4000-8000-000000000014", languageTag: "de" },
      { id: "70000000-0000-4000-8000-000000000015", languageTag: "ar" },
    ]));

    await expect(resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "fr-FR", vi.fn())).rejects.toThrow(/display name/i);
    expect(search.list).not.toHaveBeenCalled();
  });

  it("resolves canonical barcode presentation from the exact current-generation view even when ranked discovery would omit the Food", async () => {
    const db = supabaseWithBarcode([{ barcode_id: "55555555-5555-4555-8555-555555555555", food_id: mappedFoodId, gtin: barcode }]);
    generation.resolve.mockResolvedValueOnce(currentView({
      nutritionRevision: {
        id: "90000000-0000-4000-8000-000000000001",
        foodId: survivorId,
        revisionNumber: 1,
        calories: 123,
        protein_g: 11,
        carbs_g: 7,
        fat_g: 4,
        saturated_fat_g: null,
        fiber_g: 2,
        sugars_g: null,
        sodium_mg: null,
        basisAmount: 100,
        basisUnit: "g",
        nutrientMappingVersion: "map-v1",
        sourceRecordId: null,
        createdAt: "2026-09-21T00:00:00.000Z",
      },
      trust: { verified: true },
    }));
    search.list.mockResolvedValueOnce({
      items: Array.from({ length: 20 }, (_, index) => ({
        ...candidate(),
        id: `91000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })),
      nextCursor: "ranked-page-2",
    });

    const result = await resolveFoodBarcode(db.client, catalogSupabase, userId, barcode, "en", vi.fn());

    expect(result.kind).toBe("catalog");
    if (result.kind !== "catalog") throw new Error("Expected canonical Catalog barcode result.");
    expect(result.food).toMatchObject({
      id: survivorId,
      name: "Canonical yogurt",
      locale: "en",
      servingLabel: null,
      verified: true,
      nutrition: {
        calories: 123,
        protein_g: 11,
        carbs_g: 7,
        fat_g: 4,
        basis_amount: 100,
        basis_unit: "g",
      },
    });
    expect(search.list).not.toHaveBeenCalled();
  });

});
