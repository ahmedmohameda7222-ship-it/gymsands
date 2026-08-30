import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogFoodItem, FoodLog, UserFoodItem } from "@/types";

const db = vi.hoisted(() => {
  const inserted: Array<Record<string, unknown>> = [];
  const single = vi.fn(async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ...(inserted.at(-1) ?? {}) }, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn((payload: Record<string, unknown>) => {
    inserted.push(payload);
    return { select };
  });
  const from = vi.fn((table: string) => {
    if (table !== "food_logs") throw new Error(`Unexpected table in focused nullable-nutrition test: ${table}`);
    return { insert };
  });
  return { inserted, from, insert, select, single };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: { from: db.from } }));

import { addGlobalFoodToToday, upsertCustomMeal, upsertUserFood } from "@/services/database/nutrition";
import { addUserFoodToToday } from "@/services/database/food-library-logging";
import { normalizePersistedMealPlanItem } from "@/services/database/meal-plan";
import { logFoodFromPreviousLog, quickAddManualFoodLog } from "@/services/meals/food-logging-speed";
import {
  nullablePercent,
  remainingMacros,
  scaleFoodMacros,
  sumFoodLogs,
} from "@/services/nutrition/calculations";

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const userFoodId = "55555555-5555-4555-8555-555555555555";

function catalogFood(overrides: Partial<Pick<CatalogFoodItem, "calories" | "protein_g" | "carbs_g" | "fat_g">> = {}): CatalogFoodItem {
  return {
    id: foodId,
    food_name: "Catalog food",
    serving_size: "100 g",
    calories: 100,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    category: null,
    cuisine: null,
    tags: null,
    notes: null,
    source_type: "catalog",
    is_global: true,
    is_editable_by_user: false,
    ...overrides,
  };
}

function userFood(overrides: Partial<Pick<UserFoodItem, "calories" | "protein_g" | "carbs_g" | "fat_g">> = {}): UserFoodItem {
  return {
    id: userFoodId,
    user_id: userId,
    food_name: "My food",
    serving_size: "1 serving",
    calories: 240,
    protein_g: 22,
    carbs_g: 18,
    fat_g: 8,
    category: "Lunch",
    cuisine: null,
    tags: [],
    notes: null,
    source_type: "user_created",
    is_global: false,
    is_editable_by_user: true,
    ...overrides,
  };
}

function frozenLog(overrides: Partial<Pick<FoodLog, "calories" | "protein_g" | "carbs_g" | "fat_g">> = {}): FoodLog {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: userId,
    food_item_id: foodId,
    user_food_item_id: null,
    log_date: "2026-08-30",
    meal_type: "Lunch",
    food_name: "Frozen catalog food",
    serving_size: "100 g",
    quantity: 1,
    calories: 100,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  db.inserted.length = 0;
  db.from.mockClear();
  db.insert.mockClear();
  db.select.mockClear();
  db.single.mockClear();
});

describe("catalog-derived nullable nutrition scaling", () => {
  it("keeps fully known global Food behavior unchanged", () => {
    expect(scaleFoodMacros(catalogFood(), 2)).toEqual({
      calories: 200,
      protein_g: 20,
      carbs_g: 40,
      fat_g: 10,
    });
  });

  it("keeps a missing protein value unknown after scaling", () => {
    expect(scaleFoodMacros(catalogFood({ protein_g: null }), 1.5)).toEqual({
      calories: 150,
      protein_g: null,
      carbs_g: 30,
      fat_g: 7.5,
    });
  });

  it("distinguishes known zero from unknown null", () => {
    expect(scaleFoodMacros(catalogFood({ protein_g: 0 }), 2).protein_g).toBe(0);
    expect(scaleFoodMacros(catalogFood({ protein_g: null }), 2).protein_g).toBeNull();
  });

  it("preserves independently missing nutrients including undefined compatibility input", () => {
    expect(scaleFoodMacros({ ...catalogFood({ calories: null, protein_g: 12, fat_g: null }), carbs_g: undefined }, 2)).toEqual({
      calories: null,
      protein_g: 24,
      carbs_g: null,
      fat_g: null,
    });
  });
});

describe("Catalog Food and My Food logging identity", () => {
  it("Catalog Food persists canonical identity and null nutrition without fabricated zero", async () => {
    await addGlobalFoodToToday({
      userId,
      food: catalogFood({ protein_g: null, fat_g: null }),
      quantity: 2,
      mealType: "Lunch",
      date: "2026-08-30",
    });

    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      food_item_id: foodId,
      user_food_item_id: null,
      calories: 200,
      protein_g: null,
      carbs_g: 40,
      fat_g: null,
    });
  });

  it("My Food persists user-food identity while keeping its numeric nutrition contract", async () => {
    await addUserFoodToToday({
      userId,
      food: userFood({ protein_g: 0 }),
      quantity: 2,
      mealType: "Dinner",
      date: "2026-08-30",
    });

    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      food_item_id: null,
      user_food_item_id: userFoodId,
      calories: 480,
      protein_g: 0,
      carbs_g: 36,
      fat_g: 16,
    });
  });

  it("repeat/re-log preserves independently nullable frozen nutrition", async () => {
    const repeated = await logFoodFromPreviousLog(
      "offline-user",
      frozenLog({ calories: null, protein_g: null, carbs_g: 20, fat_g: 0 }),
      "2026-08-31",
      "Dinner",
    );

    expect(repeated).toMatchObject({
      calories: null,
      protein_g: null,
      carbs_g: 20,
      fat_g: 0,
    });
  });
});

describe("nullable aggregate and presentation semantics", () => {
  it("keeps a nutrient aggregate unknown when any contributing snapshot is unknown", () => {
    expect(sumFoodLogs([
      frozenLog({ calories: 100, protein_g: 10, carbs_g: 20, fat_g: 5 }),
      frozenLog({ calories: 50, protein_g: null, carbs_g: 10, fat_g: 2 }),
    ])).toEqual({
      calories: 150,
      protein_g: null,
      carbs_g: 30,
      fat_g: 7,
    });
  });

  it("keeps aggregates numeric when every contributing value is known", () => {
    expect(sumFoodLogs([
      frozenLog({ calories: 100, protein_g: 10, carbs_g: 20, fat_g: 5 }),
      frozenLog({ calories: 50, protein_g: 5, carbs_g: 10, fat_g: 2 }),
    ])).toEqual({
      calories: 150,
      protein_g: 15,
      carbs_g: 30,
      fat_g: 7,
    });
  });

  it("does not manufacture remaining or percentage values from an unknown aggregate", () => {
    const remaining = remainingMacros(
      { calories: 2000, protein_g: 150, carbs_g: 220, fat_g: 70, water_ml: 2500 },
      { calories: 500, protein_g: null, carbs_g: 60, fat_g: 20 },
    );
    expect(remaining.protein_g).toBeNull();
    expect(nullablePercent(null, 150)).toBeNull();
  });
});

describe("Saved Meal and Meal Plan nullable snapshot compatibility", () => {
  it("keeps a Saved Meal aggregate unknown when a catalog-derived nutrient is unknown", async () => {
    const meal = await upsertCustomMeal({
      userId: "offline-user",
      mealName: "Nullable saved meal",
      mealCategory: "Lunch",
      notes: null,
      isFavorite: false,
      items: [
        { food: catalogFood({ protein_g: null, fat_g: 0 }), quantity: 1 },
        { food: catalogFood(), quantity: 1 },
      ],
    });

    expect(meal.totals).toMatchObject({
      calories: 200,
      protein_g: null,
      carbs_g: 40,
      fat_g: 5,
    });
  });

  it("normalizes persisted Meal Plan nullable nutrition without fabricating zero", () => {
    const item = normalizePersistedMealPlanItem({
      id: "44444444-4444-4444-8444-444444444444",
      user_id: userId,
      plan_date: "2026-08-30",
      meal_type: "Lunch",
      food_item_id: foodId,
      user_food_item_id: null,
      food_name: "Catalog meal-plan food",
      serving_size: "100 g",
      quantity: 1,
      calories: 100,
      protein_g: null,
      carbs_g: 0,
      fat_g: null,
      status: "planned",
      food_log_id: null,
      completed_at: null,
      notes: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    });

    expect(item).toMatchObject({
      calories: 100,
      protein_g: null,
      carbs_g: 0,
      fat_g: null,
    });
  });
});

describe("numeric manual nutrition contracts stay strict", () => {
  it("keeps manual Quick Add values numeric and keeps its existing empty-entry rejection", async () => {
    const result = await quickAddManualFoodLog({
      userId: "offline-user",
      mealType: "Snack",
      calories: 180,
      proteinG: 0,
      carbsG: 20,
      fatG: 5,
    });
    expect(result).toMatchObject({ calories: 180, protein_g: 0, carbs_g: 20, fat_g: 5 });

    await expect(quickAddManualFoodLog({
      userId: "offline-user",
      mealType: "Snack",
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    })).rejects.toThrow("Enter calories or macros before quick adding.");
  });

  it("keeps My Food core nutrition validation numeric", async () => {
    await expect(upsertUserFood({
      userId: "offline-user",
      foodName: "My food",
      category: "Breakfast",
      servingSize: "1 serving",
      calories: 100,
      proteinG: Number.NaN,
      carbsG: 10,
      fatG: 5,
    })).rejects.toThrow("Protein must be a non-negative number.");
  });
});

describe("focused architecture regression guard", () => {
  it("prevents active catalog-derived compatibility boundaries from generic null-to-zero coercion", () => {
    const root = process.cwd();
    const calculations = fs.readFileSync(path.join(root, "services/nutrition/calculations.ts"), "utf8");
    const databaseNutrition = fs.readFileSync(path.join(root, "services/database/nutrition.ts"), "utf8");
    const loggingSpeed = fs.readFileSync(path.join(root, "services/meals/food-logging-speed.ts"), "utf8");

    const scaleBody = calculations.slice(
      calculations.indexOf("export function scaleFoodMacros"),
      calculations.indexOf("export function sumFoodLogs"),
    );
    const sumBody = calculations.slice(
      calculations.indexOf("export function sumFoodLogs"),
      calculations.indexOf("export function remainingMacros"),
    );
    const repeatBody = loggingSpeed.slice(
      loggingSpeed.indexOf("export async function logFoodFromPreviousLog"),
      loggingSpeed.indexOf("export async function quickAddManualFoodLog"),
    );
    const globalReadBody = databaseNutrition.slice(
      databaseNutrition.indexOf("export async function getGlobalFoods"),
      databaseNutrition.indexOf("export async function getCalorieTargets"),
    );

    expect(scaleBody).not.toMatch(/toNumber\(food\.(?:calories|protein_g|carbs_g|fat_g)\)/);
    expect(sumBody).not.toMatch(/toNumber\(log\.(?:calories|protein_g|carbs_g|fat_g)\)/);
    expect(repeatBody).not.toMatch(/Math\.max\(0,\s*toNumber\(source\.(?:calories|protein_g|carbs_g|fat_g)\)\)/);
    expect(globalReadBody).not.toMatch(/as FoodItem\[\]/);
  });
});