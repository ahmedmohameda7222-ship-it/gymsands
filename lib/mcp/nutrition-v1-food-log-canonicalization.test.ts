import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";

const mocks = vi.hoisted(() => ({
  listFoodLibraryForMcp: vi.fn(),
  resolveFoodHandoffForMcp: vi.fn(),
  resolveCatalogNewUseSelectionForMcp: vi.fn(),
}));

vi.mock("@/services/nutrition-v1/server/food-library", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/food-library")>(
    "@/services/nutrition-v1/server/food-library",
  );
  return { ...actual, listFoodLibraryForMcp: mocks.listFoodLibraryForMcp };
});
vi.mock("@/services/nutrition-v1/server/food-handoff", () => ({
  resolveFoodHandoffForMcp: mocks.resolveFoodHandoffForMcp,
  resolveCatalogNewUseSelectionForMcp: mocks.resolveCatalogNewUseSelectionForMcp,
}));

import { executeMcpTool } from "@/lib/mcp/tool-executor";

type Row = Record<string, unknown>;

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTIVE_ID = "33333333-3333-4333-8333-333333333333";
const MERGED_ID = "44444444-4444-4444-8444-444444444444";
const SURVIVOR_ID = "55555555-5555-4555-8555-555555555555";
const MY_FOOD_ID = "77777777-7777-4777-8777-777777777777";

function candidate(
  id: string,
  name: string,
  source: "catalog" | "my_food" = "catalog",
  overrides: Partial<Row> = {},
) {
  return {
    id,
    source,
    name,
    brand: null,
    category: null,
    cuisine: null,
    servingLabel: source === "catalog" ? "100 g" : "40 g",
    verified: source === "catalog",
    favorite: false,
    recentAt: null,
    frequency: 0,
    locale: "en",
    aliases: [],
    nutrition: {
      calories: source === "catalog" ? 100 : 150,
      protein_g: source === "catalog" ? 10 : null,
      carbs_g: source === "catalog" ? 12 : 25,
      fat_g: source === "catalog" ? 2 : 3,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: source === "catalog" ? 100 : 40,
      basis_unit: "g",
    },
    ...overrides,
  };
}

function handoff(
  foodId: string,
  name: string,
  source: "catalog" | "my_food",
  quantity = 1,
  overrides: Partial<Row> = {},
) {
  const serving = source === "catalog" ? "100 g" : "40 g";
  const nutrition = source === "catalog"
    ? { calories: 100 * quantity, protein_g: 10 * quantity, carbs_g: 12 * quantity, fat_g: 2 * quantity, fiber_g: null }
    : { calories: 150 * quantity, protein_g: null, carbs_g: 25 * quantity, fat_g: 3 * quantity, fiber_g: null };
  return {
    foodId,
    source,
    name,
    serving,
    quantity,
    frozenNutrition: nutrition,
    frozenSourceSnapshot: {
      food_id: foodId,
      source,
      frozen_name: name,
      resolved_quantity: quantity,
      resolved_serving_label: serving,
      frozen_nutrition: nutrition,
    },
    diaryItem: {
      foodName: name,
      servingLabel: serving,
      quantity,
      nutrition: {
        caloriesKcal: nutrition.calories,
        proteinG: nutrition.protein_g,
        carbsG: nutrition.carbs_g,
        fatG: nutrition.fat_g,
      },
      foodItemId: source === "catalog" ? foodId : null,
      userFoodItemId: source === "my_food" ? foodId : null,
    },
    ...overrides,
  };
}

function createSupabase() {
  const foodLogs: Row[] = [];
  const insert = vi.fn((payload: Row[]) => {
    foodLogs.push(...payload.map((row, index) => ({
      id: `99999999-9999-4999-8999-${String(index + 1).padStart(12, "0")}`,
      ...row,
    })));
    return {
      select: vi.fn(async () => ({ data: foodLogs.slice(-payload.length), error: null })),
    };
  });
  const from = vi.fn((table: string) => {
    if (table !== "food_logs") throw new Error(`Unexpected table ${table}`);
    return { insert };
  });
  return { client: { from } as unknown as McpContext["supabase"], foodLogs, from, insert };
}

function context(client: McpContext["supabase"]): McpContext {
  return {
    supabase: client,
    userId: USER_ID,
    connectionId: CONNECTION_ID,
    scopes: ["plaivra.nutrition.read", "plaivra.nutrition.write"],
    profile: { id: USER_ID, email: "member@example.com", full_name: "Member", role: "member" },
  };
}

async function addFood(client: McpContext["supabase"], foodName: string, quantity = 1) {
  return executeMcpTool(context(client), "add_food_log", {
    date: "2026-08-29",
    meal_type: "Breakfast",
    items: [{ food_name: foodName, quantity }],
  });
}

describe("Nutrition V1 MCP current-generation Food authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listFoodLibraryForMcp.mockResolvedValue({ items: [], nextCursor: null });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValue({
      foodId: ACTIVE_ID,
      name: "Selected food",
      languageTag: "en",
      servingChoices: [{
        servingOptionId: "88888888-8888-4888-8888-888888888888",
        label: "100 g",
        source: "generation",
      }],
    });
  });

  it("searches global Food through Catalog V2 with explicit locale/market/limit context", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Active yogurt")],
      nextCursor: null,
    });

    const result = await executeMcpTool(context(db.client), "search_foods", {
      query: "Active yogurt",
      limit: 5,
    });

    expect(result.isError).not.toBe(true);
    expect(mocks.listFoodLibraryForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, {
      query: "active yogurt",
      locale: "en",
      marketScopeCode: null,
      limit: 5,
      scope: "all",
    });
    expect(result.structuredContent.foods).toEqual([
      expect.objectContaining({
        id: ACTIVE_ID,
        source: "global",
        food_name: "Active yogurt",
        serving_size: "100 g",
      }),
    ]);
    expect(db.from).not.toHaveBeenCalledWith("food_items");
  });

  it("logs an active canonical global Food only from handoff-frozen values", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Active yogurt")],
      nextCursor: null,
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(handoff(ACTIVE_ID, "Active yogurt", "catalog", 2));

    const result = await addFood(db.client, "Active yogurt", 2);

    expect(result.isError).not.toBe(true);
    expect(mocks.resolveFoodHandoffForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, USER_ID, {
      foodId: ACTIVE_ID,
      source: "catalog",
      quantity: 2,
      serving: "100 g",
      servingOptionId: "88888888-8888-4888-8888-888888888888",
      displayName: "Active yogurt",
      languageTag: "en",
    });
    expect(db.foodLogs[0]).toMatchObject({
      food_item_id: ACTIVE_ID,
      user_food_item_id: null,
      food_name: "Active yogurt",
      serving_size: "100 g",
      quantity: 2,
      calories: 200,
      protein_g: 20,
      carbs_g: 24,
      fat_g: 4,
    });
  });

  it("freezes a redirected survivor returned by handoff, never the searched historical identity", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(MERGED_ID, "Old yogurt")],
      nextCursor: null,
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(
      handoff(SURVIVOR_ID, "Canonical yogurt", "catalog", 1, {
        frozenNutrition: { calories: 90, protein_g: 11, carbs_g: 9, fat_g: 1, fiber_g: null },
        diaryItem: {
          foodName: "Canonical yogurt",
          servingLabel: "100 g",
          quantity: 1,
          nutrition: { caloriesKcal: 90, proteinG: 11, carbsG: 9, fatG: 1 },
          foodItemId: SURVIVOR_ID,
          userFoodItemId: null,
        },
      }),
    );

    const result = await addFood(db.client, "Old yogurt");

    expect(result.isError).not.toBe(true);
    expect(db.foodLogs[0]).toMatchObject({
      food_item_id: SURVIVOR_ID,
      food_name: "Canonical yogurt",
      calories: 90,
      protein_g: 11,
    });
    expect(db.foodLogs[0]?.food_item_id).not.toBe(MERGED_ID);
  });

  it("does not invent a candidate when V2 excludes deprecated/withdrawn/missing current Foods", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({ items: [], nextCursor: null });

    const result = await addFood(db.client, "Retired yogurt");

    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("ambiguous_food");
    expect(db.foodLogs).toHaveLength(0);
    expect(mocks.resolveFoodHandoffForMcp).not.toHaveBeenCalled();
  });

  it("freezes Personal Override nutrition returned by the canonical handoff and never reads legacy corrections", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Corrected yogurt")],
      nextCursor: null,
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(
      handoff(ACTIVE_ID, "Corrected yogurt", "catalog", 2, {
        frozenNutrition: { calories: 200, protein_g: 26, carbs_g: 24, fat_g: 4, fiber_g: null },
        diaryItem: {
          foodName: "Corrected yogurt",
          servingLabel: "100 g",
          quantity: 2,
          nutrition: { caloriesKcal: 200, proteinG: 26, carbsG: 24, fatG: 4 },
          foodItemId: ACTIVE_ID,
          userFoodItemId: null,
        },
      }),
    );

    const result = await addFood(db.client, "Corrected yogurt", 2);

    expect(result.isError).not.toBe(true);
    expect(db.foodLogs[0]).toMatchObject({ calories: 200, protein_g: 26, carbs_g: 24, fat_g: 4 });
    expect(db.from).not.toHaveBeenCalledWith("food_personal_corrections");
  });

  it("preserves null nutrients in the frozen logged values", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Unknown carb yogurt")],
      nextCursor: null,
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(
      handoff(ACTIVE_ID, "Unknown carb yogurt", "catalog", 1, {
        frozenNutrition: { calories: 100, protein_g: 10, carbs_g: null, fat_g: 2, fiber_g: null },
        diaryItem: {
          foodName: "Unknown carb yogurt",
          servingLabel: "100 g",
          quantity: 1,
          nutrition: { caloriesKcal: 100, proteinG: 10, carbsG: null, fatG: 2 },
          foodItemId: ACTIVE_ID,
          userFoodItemId: null,
        },
      }),
    );

    const result = await addFood(db.client, "Unknown carb yogurt");

    expect(result.isError).not.toBe(true);
    expect(db.foodLogs[0]?.carbs_g).toBeNull();
  });

  it("keeps My Food search/handoff independent and owner-scoped through the V2 logical service", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(MY_FOOD_ID, "My oats", "my_food")],
      nextCursor: null,
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(handoff(MY_FOOD_ID, "My oats", "my_food"));

    const result = await addFood(db.client, "My oats");

    expect(result.isError).not.toBe(true);
    expect(mocks.resolveFoodHandoffForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, USER_ID, {
      foodId: MY_FOOD_ID,
      source: "my_food",
      quantity: 1,
      serving: "40 g",
      displayName: undefined,
      languageTag: null,
    });
    expect(db.foodLogs[0]).toMatchObject({
      user_food_item_id: MY_FOOD_ID,
      food_item_id: null,
      calories: 150,
      protein_g: null,
    });
  });

  it("preserves ambiguity instead of selecting one of multiple normalized matches", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [
        candidate(ACTIVE_ID, "Greek yogurt plain"),
        candidate(SURVIVOR_ID, "Greek yogurt vanilla"),
      ],
      nextCursor: null,
    });

    const result = await addFood(db.client, "Greek yogurt");

    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("ambiguous_food");
    expect(db.foodLogs).toHaveLength(0);
    expect(mocks.resolveFoodHandoffForMcp).not.toHaveBeenCalled();
  });


  it.each([
    ["de", "Deutsch yogurt"],
    ["ar", "زبادي"],
  ])("carries the exact selected Catalog candidate locale %s into serving selection and handoff", async (locale, name) => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, name, "catalog", { locale, servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name,
      languageTag: locale,
      servingChoices: [{ servingOptionId: "88888888-8888-4888-8888-888888888888", label: "170 g", source: "generation" }],
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(handoff(ACTIVE_ID, name, "catalog", 1, {
      serving: "170 g",
      diaryItem: {
        foodName: name,
        servingLabel: "170 g",
        quantity: 1,
        nutrition: { caloriesKcal: 100, proteinG: 10, carbsG: 12, fatG: 2 },
        foodItemId: ACTIVE_ID,
        userFoodItemId: null,
      },
    }));

    const result = await addFood(db.client, name);

    expect(result.isError).not.toBe(true);
    expect(mocks.resolveCatalogNewUseSelectionForMcp).toHaveBeenCalledWith(
      db.client,
      CONNECTION_ID,
      USER_ID,
      { foodId: ACTIVE_ID, displayName: name, languageTag: locale },
    );
    expect(mocks.resolveFoodHandoffForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, USER_ID, expect.objectContaining({
      foodId: ACTIVE_ID,
      source: "catalog",
      serving: "170 g",
      servingOptionId: "88888888-8888-4888-8888-888888888888",
      displayName: name,
      languageTag: locale,
    }));
  });

  it("does not attach Catalog locale identity to My Food handoff", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(MY_FOOD_ID, "My oats", "my_food", { locale: "ar" })],
      nextCursor: null,
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(handoff(MY_FOOD_ID, "My oats", "my_food"));

    const result = await addFood(db.client, "My oats");

    expect(result.isError).not.toBe(true);
    expect(mocks.resolveCatalogNewUseSelectionForMcp).not.toHaveBeenCalled();
    expect(mocks.resolveFoodHandoffForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, USER_ID, expect.not.objectContaining({
      languageTag: expect.any(String),
    }));
  });

  it("fails Catalog new use when zero authoritative serving choices exist", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "No serving yogurt", "catalog", { servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name: "No serving yogurt",
      languageTag: "en",
      servingChoices: [],
    });

    const result = await addFood(db.client, "No serving yogurt");

    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("authoritative_serving_unavailable");
    expect(mocks.resolveFoodHandoffForMcp).not.toHaveBeenCalled();
    expect(db.foodLogs).toHaveLength(0);
  });

  it("auto-selects the sole effective Catalog serving when no serving_hint is supplied", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Single serving yogurt", "catalog", { servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name: "Single serving yogurt",
      languageTag: "en",
      servingChoices: [{ servingOptionId: "88888888-8888-4888-8888-888888888888", label: "170 g", source: "generation" }],
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(handoff(ACTIVE_ID, "Single serving yogurt", "catalog"));

    const result = await addFood(db.client, "Single serving yogurt");

    expect(result.isError).not.toBe(true);
    expect(mocks.resolveFoodHandoffForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, USER_ID, expect.objectContaining({
      serving: "170 g",
      servingOptionId: "88888888-8888-4888-8888-888888888888",
    }));
  });

  it("returns explicit serving ambiguity instead of choosing among multiple effective Catalog servings", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Multi serving yogurt", "catalog", { servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name: "Multi serving yogurt",
      languageTag: "en",
      servingChoices: [
        { servingOptionId: "88888888-8888-4888-8888-888888888888", label: "170 g", source: "generation" },
        { servingOptionId: "99999999-9999-4999-8999-999999999999", label: "1 cup", source: "generation" },
      ],
    });

    const result = await addFood(db.client, "Multi serving yogurt");

    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("ambiguous_serving");
    expect(result.structuredContent.details).toMatchObject({
      serving_choices: [
        { servingOptionId: "88888888-8888-4888-8888-888888888888", label: "170 g", source: "generation" },
        { servingOptionId: "99999999-9999-4999-8999-999999999999", label: "1 cup", source: "generation" },
      ],
    });
    expect(mocks.resolveFoodHandoffForMcp).not.toHaveBeenCalled();
  });

  it("matches serving_hint exactly to one effective Catalog serving and carries its exact identity", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Hinted yogurt", "catalog", { servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name: "Hinted yogurt",
      languageTag: "en",
      servingChoices: [
        { servingOptionId: "88888888-8888-4888-8888-888888888888", label: "170 g", source: "generation" },
        { servingOptionId: "99999999-9999-4999-8999-999999999999", label: "1 cup", source: "generation" },
      ],
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(handoff(ACTIVE_ID, "Hinted yogurt", "catalog"));

    const result = await executeMcpTool(context(db.client), "add_food_log", {
      date: "2026-08-29",
      meal_type: "Breakfast",
      items: [{ food_name: "Hinted yogurt", quantity: 1, serving_hint: "1 cup" }],
    });

    expect(result.isError).not.toBe(true);
    expect(mocks.resolveFoodHandoffForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, USER_ID, expect.objectContaining({
      serving: "1 cup",
      servingOptionId: "99999999-9999-4999-8999-999999999999",
    }));
    expect(db.foodLogs[0]?.notes).toBeNull();
  });

  it("rejects a serving_hint that is not an exact effective serving choice", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Hinted yogurt", "catalog", { servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name: "Hinted yogurt",
      languageTag: "en",
      servingChoices: [{ servingOptionId: "88888888-8888-4888-8888-888888888888", label: "170 g", source: "generation" }],
    });

    const result = await executeMcpTool(context(db.client), "add_food_log", {
      date: "2026-08-29",
      meal_type: "Breakfast",
      items: [{ food_name: "Hinted yogurt", quantity: 1, serving_hint: "100 g" }],
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("invalid_serving_hint");
    expect(mocks.resolveFoodHandoffForMcp).not.toHaveBeenCalled();
  });

  it("accepts an owner override serving choice with no generation servingOptionId", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Owner yogurt", "catalog", { servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name: "Owner yogurt",
      languageTag: "en",
      servingChoices: [{ servingOptionId: null, label: "my bowl", source: "owner_override" }],
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(handoff(ACTIVE_ID, "Owner yogurt", "catalog"));

    const result = await executeMcpTool(context(db.client), "add_food_log", {
      date: "2026-08-29",
      meal_type: "Breakfast",
      items: [{ food_name: "Owner yogurt", quantity: 1, serving_hint: "my bowl" }],
    });

    expect(result.isError).not.toBe(true);
    expect(mocks.resolveFoodHandoffForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, USER_ID, expect.objectContaining({
      serving: "my bowl",
      servingOptionId: null,
    }));
  });

  it("keeps public MCP current-truth implementation free of direct food_items access", () => {
    for (const file of [
      "lib/mcp/tool-executor.ts",
      "lib/mcp/nutrition-v1-food-execution.ts",
      "lib/mcp/tool-executor-implementation.ts",
    ]) {
      const value = readFileSync(join(process.cwd(), file), "utf8");
      expect(value, file).not.toMatch(/\.from\(["']food_items["']\)/);
      expect(value, file).not.toContain("searchCatalogFoodsByName");
    }
  });

  it("uses serving_option_id to disambiguate two authoritative servings with the same label", async () => {
    const db = createSupabase();
    const firstId = "88888888-8888-4888-8888-888888888888";
    const secondId = "99999999-9999-4999-8999-999999999999";
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Twin cup yogurt", "catalog", { servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name: "Twin cup yogurt",
      languageTag: "en",
      servingChoices: [
        { servingOptionId: firstId, label: "1 cup", source: "generation" },
        { servingOptionId: secondId, label: "1 cup", source: "generation" },
      ],
    });
    mocks.resolveFoodHandoffForMcp.mockResolvedValueOnce(handoff(ACTIVE_ID, "Twin cup yogurt", "catalog"));

    const result = await executeMcpTool(context(db.client), "add_food_log", {
      date: "2026-08-29",
      meal_type: "Breakfast",
      items: [{
        food_name: "Twin cup yogurt",
        quantity: 1,
        serving_hint: "1 cup",
        serving_option_id: secondId,
      }],
    });

    expect(result.isError).not.toBe(true);
    expect(mocks.resolveFoodHandoffForMcp).toHaveBeenCalledWith(db.client, CONNECTION_ID, USER_ID, expect.objectContaining({
      serving: "1 cup",
      servingOptionId: secondId,
    }));
  });

  it("returns serving ambiguity for duplicate labels when serving_option_id is omitted", async () => {
    const db = createSupabase();
    mocks.listFoodLibraryForMcp.mockResolvedValueOnce({
      items: [candidate(ACTIVE_ID, "Twin cup yogurt", "catalog", { servingLabel: null })],
      nextCursor: null,
    });
    mocks.resolveCatalogNewUseSelectionForMcp.mockResolvedValueOnce({
      foodId: ACTIVE_ID,
      name: "Twin cup yogurt",
      languageTag: "en",
      servingChoices: [
        { servingOptionId: "88888888-8888-4888-8888-888888888888", label: "1 cup", source: "generation" },
        { servingOptionId: "99999999-9999-4999-8999-999999999999", label: "1 cup", source: "generation" },
      ],
    });

    const result = await executeMcpTool(context(db.client), "add_food_log", {
      date: "2026-08-29",
      meal_type: "Breakfast",
      items: [{ food_name: "Twin cup yogurt", quantity: 1, serving_hint: "1 cup" }],
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("ambiguous_serving");
    expect(mocks.resolveFoodHandoffForMcp).not.toHaveBeenCalled();
  });

});
