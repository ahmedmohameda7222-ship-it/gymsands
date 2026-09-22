"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
import type {
  CatalogFoodItem,
  CustomMeal,
  DailyNutritionSummary,
  FoodKitchen,
  FoodLibraryItem,
  FoodLog,
  FoodSubcategory,
  MealItem,
  MealPlanItem,
  MealType,
  UserFoodItem,
  WaterLog
} from "@/types";
import { scaleFoodMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import { normalizeSavedTargets, type SavedTargets } from "@/services/nutrition/targets";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
export const egyptianFoodKitchenName = "Egyptian Kitchen";
export const egyptianFoodSubcategories = [
  "Bread",
  "Breakfast",
  "Carb",
  "Dairy",
  "Dessert",
  "Dip",
  "Drink",
  "Legumes",
  "Snack",
  "Soup",
  "Stew",
  "Vegetable"
] as const;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNutrition(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid persisted ${label}.`);
  return parsed;
}

function persistedText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid persisted ${label}.`);
  return value;
}

function nullablePersistedText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Invalid persisted ${label}.`);
  return value;
}

function nullablePersistedTags(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new Error("Invalid persisted Food tags.");
  }
  return [...value];
}

function normalizeCatalogFood(row: Record<string, unknown>): CatalogFoodItem {
  return {
    id: persistedText(row.id, "Food ID"),
    food_name: persistedText(row.food_name, "Food name"),
    serving_size: persistedText(row.serving_size, "Food serving size"),
    calories: nullableNutrition(row.calories, "Food calories"),
    protein_g: nullableNutrition(row.protein_g, "Food protein"),
    carbs_g: nullableNutrition(row.carbs_g, "Food carbs"),
    fat_g: nullableNutrition(row.fat_g, "Food fat"),
    category: nullablePersistedText(row.category, "Food category"),
    cuisine: nullablePersistedText(row.cuisine, "Food cuisine"),
    kitchen_id: nullablePersistedText(row.kitchen_id, "Food kitchen ID"),
    subcategory_id: nullablePersistedText(row.subcategory_id, "Food subcategory ID"),
    fiber_g: nullableNutrition(row.fiber_g, "Food fiber"),
    sugar_g: nullableNutrition(row.sugar_g, "Food sugar"),
    sodium_mg: nullableNutrition(row.sodium_mg, "Food sodium"),
    tags: nullablePersistedTags(row.tags),
    notes: nullablePersistedText(row.notes, "Food notes"),
    source_type: persistedText(row.source_type, "Food source type"),
    is_global: true,
    is_editable_by_user: false
  };
}

function normalizeFrozenFoodLog(row: Record<string, unknown>): FoodLog {
  return {
    ...(row as unknown as FoodLog),
    calories: nullableNutrition(row.calories, "Food Log calories"),
    protein_g: nullableNutrition(row.protein_g, "Food Log protein"),
    carbs_g: nullableNutrition(row.carbs_g, "Food Log carbs"),
    fat_g: nullableNutrition(row.fat_g, "Food Log fat")
  };
}

function normalizeFrozenMealPlanItem(row: Record<string, unknown>): MealPlanItem {
  return {
    ...(row as unknown as MealPlanItem),
    calories: nullableNutrition(row.calories, "Meal Plan calories"),
    protein_g: nullableNutrition(row.protein_g, "Meal Plan protein"),
    carbs_g: nullableNutrition(row.carbs_g, "Meal Plan carbs"),
    fat_g: nullableNutrition(row.fat_g, "Meal Plan fat")
  };
}

function normalizeMealType(value: string | null | undefined): MealType {
  return mealTypes.includes(value as MealType) ? (value as MealType) : "Breakfast";
}

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

export function getDefaultFoodCategories() {
  return [...egyptianFoodSubcategories];
}

type CatalogSearchCandidate = {
  id: string;
  source: "catalog" | "my_food";
  name: string;
  brand: string | null;
  category: string | null;
  cuisine: string | null;
  servingLabel: string | null;
  verified: boolean;
  locale: string;
  nutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    saturated_fat_g: number | null;
    fiber_g: number | null;
    sugars_g: number | null;
    sodium_mg: number | null;
    basis_amount: number | null;
    basis_unit: "g" | "ml" | "serving" | "piece" | "custom" | null;
  };
};

type CatalogSearchPage = {
  items: CatalogSearchCandidate[];
  nextCursor: string | null;
};

function browserLocale() {
  return typeof navigator === "undefined" || !navigator.language.trim() ? "en" : navigator.language;
}

function browserCatalogSearchLanguageTag() {
  const locale = browserLocale().trim().replace(/_/g, "-");
  return locale.split("-")[0]?.trim() || "en";
}

function isCatalogSearchPage(value: unknown): value is CatalogSearchPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const page = value as Record<string, unknown>;
  return Array.isArray(page.items) && (page.nextCursor === null || typeof page.nextCursor === "string");
}

function normalizeCatalogSearchFood(food: CatalogSearchCandidate): CatalogFoodItem {
  return {
    id: persistedText(food.id, "Food ID"),
    food_name: persistedText(food.name, "Food name"),
    serving_size: food.servingLabel?.trim() ?? "",
    calories: nullableNutrition(food.nutrition.calories, "Food calories"),
    protein_g: nullableNutrition(food.nutrition.protein_g, "Food protein"),
    carbs_g: nullableNutrition(food.nutrition.carbs_g, "Food carbs"),
    fat_g: nullableNutrition(food.nutrition.fat_g, "Food fat"),
    category: nullablePersistedText(food.category, "Food category"),
    cuisine: nullablePersistedText(food.cuisine, "Food cuisine"),
    kitchen_id: null,
    subcategory_id: null,
    fiber_g: nullableNutrition(food.nutrition.fiber_g, "Food fiber"),
    sugar_g: nullableNutrition(food.nutrition.sugars_g, "Food sugar"),
    sodium_mg: nullableNutrition(food.nutrition.sodium_mg, "Food sodium"),
    tags: [],
    notes: null,
    source_type: "food_catalog_v2",
    locale: persistedText(food.locale, "Food locale"),
    is_global: true,
    is_editable_by_user: false
  };
}

async function searchCurrentCatalog(
  query: string,
  options: { category?: string; cuisine?: string; limit?: number } = {}
): Promise<CatalogFoodItem[]> {
  if (!supabase) throw new Error("Database not connected");
  const target = Math.max(1, Math.min(80, Math.trunc(options.limit ?? 36)));
  const foods: CatalogFoodItem[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const searchResult = await supabase.rpc("search_food_catalog_v2", {
      p_query: query.trim(),
      p_language_tag: browserCatalogSearchLanguageTag(),
      p_script_code: null,
      p_market_scope_code: null,
      p_cursor: cursor,
      p_limit: Math.min(20, target - foods.length),
      p_category: options.category?.trim() || null,
      p_cuisine: options.cuisine?.trim() || null,
      p_scope: "all",
      p_filters: {}
    });
    const data: unknown = searchResult.data;
    const error = searchResult.error;
    if (error) throw new Error(`Food Catalog V2 search failed: ${error.message ?? "database error"}`);
    if (!isCatalogSearchPage(data)) throw new Error("Food Catalog V2 search returned an invalid page.");

    for (const item of data.items) {
      if (item.source !== "catalog") continue;
      foods.push(normalizeCatalogSearchFood(item));
      if (foods.length >= target) break;
    }
    cursor = data.nextCursor;
    pageCount += 1;
  } while (cursor && foods.length < target && pageCount < 10);

  return foods;
}

export async function getFoodCategories() {
  if (!supabase) throw new Error("Database not connected");

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("User session invalid.");

  const response = await fetch(
    "/api/nutrition/v1/foods/categories",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && !Array.isArray(body)
      && typeof (body as Record<string, unknown>).error === "string"
      ? (body as Record<string, unknown>).error as string
      : "Food categories could not be loaded.";
    throw new Error(error);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Food category facets returned an invalid response.");
  }
  const categories = (body as Record<string, unknown>).categories;
  if (!Array.isArray(categories) || categories.some((value) => typeof value !== "string")) {
    throw new Error("Food category facets returned an invalid response.");
  }

  return Array.from(new Set(categories.map((value) => value.trim()).filter(Boolean))).sort();
}

export async function getGlobalFoods(
  query = "",
  options: { category?: string; kitchen?: string; kitchenId?: string; subcategoryId?: string; limit?: number } = {}
): Promise<CatalogFoodItem[]> {
  return searchCurrentCatalog(query, {
    category: options.category,
    limit: options.limit
  });
}

export async function getCalorieTargets(userId: string, options?: { throwOnError?: boolean }) {
  if (!canUseUserData(userId)) return null;

  const { data, error } = await supabase!
    .from("calorie_targets")
    .select("daily_calories,protein_g,carbs_g,fat_g,water_ml")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Plaivra could not load calorie targets.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load calorie targets. ${error.message}`);
    return null;
  }

  return normalizeSavedTargets(data as Partial<SavedTargets> | null);
}

export async function upsertCalorieTargets({
  userId,
  dailyCalories,
  proteinG,
  carbsG,
  fatG,
  waterMl
}: {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
}) {
  const payload = {
    user_id: userId,
    daily_calories: dailyCalories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    water_ml: waterMl
  };

  if (!canUseUserData(userId)) throw new Error("User session invalid");

  const { data, error } = await supabase!
    .from("calorie_targets")
    .upsert(payload, { onConflict: "user_id" })
    .select("daily_calories,protein_g,carbs_g,fat_g,water_ml")
    .single();

  if (error) throw error;
  return data;
}

export async function getTodayFoodLogs(
  userId: string,
  date = todayIso(),
  options?: { throwOnError?: boolean }
) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Plaivra could not load today's food logs.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load today's food logs. ${error.message}`);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeFrozenFoodLog);
}

export type BrowserCatalogServingChoice = {
  servingOptionId: string | null;
  label: string;
  source: "generation" | "owner_override";
  nutrition?: CatalogSearchCandidate["nutrition"];
};

export type BrowserCatalogNewUseSelection = {
  foodId: string;
  name: string;
  languageTag: string;
  servingChoices: BrowserCatalogServingChoice[];
};

function parseCatalogServingNutrition(value: unknown): CatalogSearchCandidate["nutrition"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Catalog serving selection returned invalid nutrition.");
  }
  const nutrition = value as Record<string, unknown>;
  const basisUnit = nutrition.basis_unit;
  if (
    basisUnit !== null
    && basisUnit !== "g"
    && basisUnit !== "ml"
    && basisUnit !== "serving"
    && basisUnit !== "piece"
    && basisUnit !== "custom"
  ) {
    throw new Error("Catalog serving selection returned invalid nutrition.");
  }
  return {
    calories: nullableNutrition(nutrition.calories, "serving calories"),
    protein_g: nullableNutrition(nutrition.protein_g, "serving protein"),
    carbs_g: nullableNutrition(nutrition.carbs_g, "serving carbs"),
    fat_g: nullableNutrition(nutrition.fat_g, "serving fat"),
    saturated_fat_g: nullableNutrition(nutrition.saturated_fat_g, "serving saturated fat"),
    fiber_g: nullableNutrition(nutrition.fiber_g, "serving fiber"),
    sugars_g: nullableNutrition(nutrition.sugars_g, "serving sugars"),
    sodium_mg: nullableNutrition(nutrition.sodium_mg, "serving sodium"),
    basis_amount: nullableNutrition(nutrition.basis_amount, "serving basis amount"),
    basis_unit: basisUnit,
  };
}

function parseCatalogNewUseSelection(value: unknown): BrowserCatalogNewUseSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Catalog serving selection returned an invalid result.");
  }
  const row = value as Record<string, unknown>;
  const foodId = typeof row.foodId === "string" ? row.foodId : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const languageTag = typeof row.languageTag === "string" ? row.languageTag.trim() : "";
  if (!isUuid(foodId) || !name || !languageTag || !Array.isArray(row.servingChoices)) {
    throw new Error("Catalog serving selection returned an invalid result.");
  }
  const servingChoices = row.servingChoices.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Catalog serving selection returned an invalid choice.");
    }
    const choice = value as Record<string, unknown>;
    const servingOptionId = choice.servingOptionId === null
      ? null
      : typeof choice.servingOptionId === "string" && isUuid(choice.servingOptionId)
        ? choice.servingOptionId
        : undefined;
    if (
      servingOptionId === undefined
      || typeof choice.label !== "string"
      || !choice.label.trim()
      || (choice.source !== "generation" && choice.source !== "owner_override")
    ) {
      throw new Error("Catalog serving selection returned an invalid choice.");
    }
    if (choice.source === "owner_override" && servingOptionId !== null) {
      throw new Error("Owner serving selection returned an invalid Catalog identity.");
    }
    if (choice.source === "generation" && servingOptionId === null) {
      throw new Error("Generation serving selection is missing its exact identity.");
    }
    const projectedNutrition = choice.nutrition === undefined
      ? undefined
      : parseCatalogServingNutrition(choice.nutrition);
    return {
      servingOptionId,
      label: choice.label.trim(),
      source: choice.source,
      ...(projectedNutrition ? { nutrition: projectedNutrition } : {}),
    } as BrowserCatalogServingChoice;
  });
  return { foodId, name, languageTag, servingChoices };
}

export async function getCatalogNewUseSelection(
  food: Pick<CatalogFoodItem, "id" | "food_name" | "locale">,
): Promise<BrowserCatalogNewUseSelection> {
  if (!supabase || !isUuid(food.id)) throw new Error("Catalog Food identity is invalid.");
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("User session invalid.");

  const params = new URLSearchParams({
    displayName: persistedText(food.food_name, "Food name"),
    languageTag: typeof food.locale === "string" && food.locale.trim() ? food.locale.trim() : browserLocale(),
  });
  const response = await fetch(
    `/api/nutrition/v1/foods/${encodeURIComponent(food.id)}/selection?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && !Array.isArray(body)
      && typeof (body as Record<string, unknown>).error === "string"
      ? String((body as Record<string, unknown>).error)
      : "Catalog serving selection could not be loaded.";
    throw new Error(message);
  }
  const selection = parseCatalogNewUseSelection(body);
  if (selection.foodId !== food.id) throw new Error("Catalog serving selection returned the wrong Food identity.");
  return selection;
}

export function withCatalogServingChoice(
  food: CatalogFoodItem,
  choice: BrowserCatalogServingChoice,
): CatalogFoodItem {
  return {
    ...food,
    serving_size: choice.label,
    serving_option_id: choice.servingOptionId,
    ...(choice.nutrition ? {
      calories: choice.nutrition.calories,
      protein_g: choice.nutrition.protein_g,
      carbs_g: choice.nutrition.carbs_g,
      fat_g: choice.nutrition.fat_g,
      fiber_g: choice.nutrition.fiber_g,
      sugar_g: choice.nutrition.sugars_g,
      sodium_mg: choice.nutrition.sodium_mg,
    } : {}),
  };
}

type BrowserCatalogHandoff = {
  foodId: string;
  name: string;
  serving: string;
  quantity: number;
  frozenNutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
  diaryItem: {
    foodName: string;
    servingLabel: string;
    quantity: number;
    nutrition: {
      caloriesKcal: number | null;
      proteinG: number | null;
      carbsG: number | null;
      fatG: number | null;
    };
    foodItemId: string | null;
  };
};

async function resolveBrowserCatalogHandoff(
  userId: string,
  food: Pick<FoodLibraryItem, "id" | "food_name" | "serving_size"> & { locale?: string; serving_option_id?: string | null },
  quantity: number,
): Promise<BrowserCatalogHandoff> {
  if (!canUseUserData(userId) || !isUuid(food.id)) throw new Error("Catalog Food session or identity is invalid.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");

  const session = await supabase!.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("User session invalid.");

  let serving = food.serving_size.trim();
  let servingOptionId = food.serving_option_id ?? null;
  if (!servingOptionId) {
    const selection = await getCatalogNewUseSelection(food as CatalogFoodItem);
    if (selection.servingChoices.length === 0) {
      throw new Error("No authoritative serving is available yet.");
    }
    if (selection.servingChoices.length > 1) {
      throw new Error("Choose an authoritative serving before adding this Food.");
    }
    const choice = selection.servingChoices[0]!;
    serving = choice.label;
    servingOptionId = choice.servingOptionId;
  }
  if (!serving) throw new Error("No authoritative serving is available yet.");

  const params = new URLSearchParams({
    source: "catalog",
    quantity: String(quantity),
    serving,
    displayName: food.food_name,
    languageTag: "locale" in food && typeof food.locale === "string" && food.locale.trim() ? food.locale.trim() : browserLocale(),
  });
  if (servingOptionId) params.set("servingOptionId", servingOptionId);
  const response = await fetch(
    `/api/nutrition/v1/foods/${encodeURIComponent(food.id)}/handoff?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await response.json().catch(() => ({})) as BrowserCatalogHandoff & { error?: string };
  if (!response.ok) throw new Error(body.error || "Catalog Food could not be revalidated.");
  if (!isUuid(body.foodId) || !body.name?.trim() || !body.serving?.trim()) {
    throw new Error("Catalog Food handoff returned an invalid result.");
  }
  return body;
}

export async function addGlobalFoodToToday({
  userId,
  food,
  quantity,
  mealType = "Breakfast",
  date = todayIso()
}: {
  userId: string;
  food: CatalogFoodItem;
  quantity: number;
  mealType?: string;
  date?: string;
}) {
  const safeMealType = normalizeMealType(mealType);
  const handoff = await resolveBrowserCatalogHandoff(userId, food, quantity);
  const payload = {
    user_id: userId,
    food_item_id: handoff.diaryItem.foodItemId,
    user_food_item_id: null,
    log_date: date,
    meal_type: safeMealType,
    food_name: handoff.diaryItem.foodName,
    serving_size: handoff.diaryItem.servingLabel,
    quantity: handoff.diaryItem.quantity,
    calories: handoff.diaryItem.nutrition.caloriesKcal,
    protein_g: handoff.diaryItem.nutrition.proteinG,
    carbs_g: handoff.diaryItem.nutrition.carbsG,
    fat_g: handoff.diaryItem.nutrition.fatG,
    notes: null
  };

  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) {
    console.warn("Plaivra could not add this food log.", error.message);
    throw error;
  }
  return normalizeFrozenFoodLog(data as Record<string, unknown>);
}

function normalizeUserFood(row: Record<string, unknown>): UserFoodItem {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    food_name: String(row.food_name ?? "Custom food"),
    serving_size: String(row.serving_size ?? "1 serving"),
    calories: toNumber(row.calories),
    protein_g: toNumber(row.protein_g),
    carbs_g: toNumber(row.carbs_g),
    fat_g: toNumber(row.fat_g),
    category: (row.category as string | null) ?? null,
    cuisine: (row.cuisine as string | null) ?? null,
    kitchen_id: (row.kitchen_id as string | null) ?? null,
    subcategory_id: (row.subcategory_id as string | null) ?? null,
    fiber_g: row.fiber_g === null || row.fiber_g === undefined ? null : toNumber(row.fiber_g),
    sugar_g: row.sugar_g === null || row.sugar_g === undefined ? null : toNumber(row.sugar_g),
    sodium_mg: row.sodium_mg === null || row.sodium_mg === undefined ? null : toNumber(row.sodium_mg),
    tags: (row.tags as string[] | null) ?? [],
    notes: (row.notes as string | null) ?? null,
    source_type: "user_created",
    is_global: false,
    is_editable_by_user: true
  };
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`);
}

export type UserFoodInput = {
  id?: string;
  userId: string;
  foodName: string;
  kitchenId?: string | null;
  cuisine?: string | null;
  subcategoryId?: string | null;
  category: string;
  servingSize: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  notes?: string | null;
};

function validateUserFoodInput(input: UserFoodInput) {
  if (!input.foodName.trim()) throw new Error("Food name is required.");
  if (!input.servingSize.trim()) throw new Error("Serving size is required.");
  if (!input.category.trim()) throw new Error("Choose or create a subcategory.");
  assertNonNegative(input.calories, "Calories");
  assertNonNegative(input.proteinG, "Protein");
  assertNonNegative(input.carbsG, "Carbs");
  assertNonNegative(input.fatG, "Fat");
  if (input.fiberG !== null && input.fiberG !== undefined) assertNonNegative(input.fiberG, "Fiber");
  if (input.sugarG !== null && input.sugarG !== undefined) assertNonNegative(input.sugarG, "Sugar");
  if (input.sodiumMg !== null && input.sodiumMg !== undefined) assertNonNegative(input.sodiumMg, "Sodium");
}

function userFoodPayload(input: UserFoodInput) {
  validateUserFoodInput(input);
  return {
    user_id: input.userId,
    food_name: input.foodName.trim(),
    serving_size: input.servingSize.trim(),
    calories: input.calories,
    protein_g: input.proteinG,
    carbs_g: input.carbsG,
    fat_g: input.fatG,
    category: input.category.trim(),
    cuisine: input.cuisine?.trim() || null,
    kitchen_id: input.kitchenId || null,
    subcategory_id: input.subcategoryId || null,
    fiber_g: input.fiberG ?? null,
    sugar_g: input.sugarG ?? null,
    sodium_mg: input.sodiumMg ?? null,
    notes: input.notes?.trim() || null
  };
}

export async function getFoodKitchens(userId: string) {
  const fallbackKitchen: FoodKitchen = {
    id: "egyptian-kitchen",
    user_id: null,
    name: egyptianFoodKitchenName,
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const fallbackSubcategories = egyptianFoodSubcategories.map((name) => ({
    id: `egyptian-${name.toLowerCase()}`,
    kitchen_id: fallbackKitchen.id,
    name,
    created_at: fallbackKitchen.created_at,
    updated_at: fallbackKitchen.updated_at
  })) as FoodSubcategory[];

  if (!canUseUserData(userId)) return { kitchens: [fallbackKitchen], subcategories: fallbackSubcategories };

  const [kitchensResult, subcategoriesResult] = await Promise.all([
    supabase!
      .from("food_kitchens")
      .select("*")
      .or(`is_system.eq.true,user_id.eq.${userId}`)
      .order("is_system", { ascending: false })
      .order("name"),
    supabase!.from("food_subcategories").select("*").order("name")
  ]);

  if (kitchensResult.error || subcategoriesResult.error) {
    console.warn(
      "Plaivra could not load food kitchens.",
      kitchensResult.error?.message || subcategoriesResult.error?.message
    );
    return { kitchens: [fallbackKitchen], subcategories: fallbackSubcategories };
  }

  return {
    kitchens: ((kitchensResult.data?.length ? kitchensResult.data : [fallbackKitchen]) ?? []) as FoodKitchen[],
    subcategories: ((subcategoriesResult.data?.length ? subcategoriesResult.data : fallbackSubcategories) ?? []) as FoodSubcategory[]
  };
}

export async function createFoodKitchen(userId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Kitchen name is required.");
  if (!canUseUserData(userId)) throw new Error("User session invalid");

  const { data, error } = await supabase!
    .from("food_kitchens")
    .insert({ user_id: userId, name: cleanName, is_system: false })
    .select("*")
    .single();
  if (error) throw error;
  return data as FoodKitchen;
}

export async function createFoodSubcategory(kitchenId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Subcategory name is required.");
  if (!supabase || !isUuid(kitchenId)) {
    return {
      id: crypto.randomUUID(),
      kitchen_id: kitchenId,
      name: cleanName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as FoodSubcategory;
  }

  const { data, error } = await supabase!
    .from("food_subcategories")
    .insert({ kitchen_id: kitchenId, name: cleanName })
    .select("*")
    .single();
  if (error) throw error;
  return data as FoodSubcategory;
}

export async function getUserFoods(userId: string) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!.from("user_food_items").select("*").eq("user_id", userId).order("food_name");
  if (error) {
    console.warn("Plaivra could not load custom foods.", error.message);
    return [];
  }
  return (data ?? []).map((row) => normalizeUserFood(row as Record<string, unknown>));
}

export async function getFoodLibrary(
  userId: string,
  query = "",
  options: { category?: string; kitchen?: string; kitchenId?: string; subcategoryId?: string; limit?: number } = {}
): Promise<FoodLibraryItem[]> {
  const [globalFoods, userFoods] = await Promise.all([
    getGlobalFoods(query, { category: options.category, kitchen: options.kitchen, kitchenId: options.kitchenId, subcategoryId: options.subcategoryId, limit: options.limit ?? 60 }),
    getUserFoods(userId)
  ]);
  const normalizedQuery = normalizeText(query);
  const foods: FoodLibraryItem[] = [...globalFoods, ...userFoods];
  return foods.filter((food) => {
    const matchesQuery = !normalizedQuery || normalizeText(food.food_name).includes(normalizedQuery);
    const matchesCategory = !options.category || food.category === options.category;
    if (food.is_global !== false) {
      // V2 catalog rows are generation/domain projections. Legacy kitchen and
      // subcategory IDs are not canonical Food metadata and must not filter them.
      return matchesQuery && matchesCategory;
    }
    const matchesKitchen =
      !options.kitchenId
      || food.kitchen_id === options.kitchenId
      || (food.cuisine === egyptianFoodKitchenName && options.kitchen === egyptianFoodKitchenName);
    const matchesLegacyKitchen = !options.kitchen || food.cuisine === options.kitchen || food.kitchen_id === options.kitchen;
    const matchesSubcategory = !options.subcategoryId || food.subcategory_id === options.subcategoryId || food.category === options.category;
    return matchesQuery && matchesCategory && matchesKitchen && matchesLegacyKitchen && matchesSubcategory;
  }).slice(0, options.limit ?? 80);
}

export async function upsertUserFood(input: UserFoodInput) {
  const payload = userFoodPayload(input);

  if (!canUseUserData(input.userId)) throw new Error("User session invalid");

  const request =
    input.id && isUuid(input.id)
      ? supabase!.from("user_food_items").update(payload).eq("id", input.id).eq("user_id", input.userId)
      : supabase!.from("user_food_items").insert(payload);

  const { data, error } = await request.select("*").single();
  if (error) throw error;
  return normalizeUserFood(data as Record<string, unknown>);
}

export async function deleteUserFood(userId: string, foodId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!.from("user_food_items").delete().eq("id", foodId).eq("user_id", userId);
  if (error) throw error;
  return true;
}

export async function getWaterLogs(userId: string, date: string) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("water_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Plaivra could not load water logs.", error.message);
    return [];
  }
  return (data ?? []) as WaterLog[];
}

export async function addWaterLog(userId: string, date: string, amountMl: number) {
  if (!Number.isFinite(amountMl) || amountMl <= 0) throw new Error("Water amount must be greater than zero.");
  const payload = { user_id: userId, log_date: date, amount_ml: Math.round(amountMl) };
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("water_logs").insert(payload).select("*").single();
  if (error) throw error;
  return data as WaterLog;
}

export async function deleteWaterLog(userId: string, id: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!.from("water_logs").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return true;
}

function weekDates(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toLocaleDateString("en-CA");
  });
}

export async function getNutritionWeek(userId: string, weekStart: string, options?: { throwOnError?: boolean }) {
  const dates = weekDates(weekStart);
  const [targets, logsResult, waterResult] = await Promise.all([
    getCalorieTargets(userId),
    canUseUserData(userId)
      ? supabase!
          .from("food_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("log_date", dates[0])
          .lte("log_date", dates[6])
          .order("log_date", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    canUseUserData(userId)
      ? supabase!
          .from("water_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("log_date", dates[0])
          .lte("log_date", dates[6])
      : Promise.resolve({ data: [], error: null })
  ]);

  if (logsResult.error) {
    console.warn("Plaivra could not load weekly calorie logs.", logsResult.error.message);
    if (options?.throwOnError) throw new Error(`Could not load weekly food logs. ${logsResult.error.message}`);
  }
  if (waterResult.error) {
    console.warn("Plaivra could not load weekly water logs.", waterResult.error.message);
    if (options?.throwOnError) throw new Error(`Could not load weekly water logs. ${waterResult.error.message}`);
  }

  const logs = ((logsResult.data ?? []) as Record<string, unknown>[]).map(normalizeFrozenFoodLog).reduce<Record<string, FoodLog[]>>((byDate, log) => {
    byDate[log.log_date] = [...(byDate[log.log_date] ?? []), log];
    return byDate;
  }, {});
  const water = ((waterResult.data ?? []) as WaterLog[]).reduce<Record<string, number>>((byDate, log) => {
    byDate[log.log_date] = (byDate[log.log_date] ?? 0) + toNumber(log.amount_ml);
    return byDate;
  }, {});

  return dates.map((date) => {
    const dayLogs = logs[date] ?? [];
    const totals = sumFoodLogs(dayLogs);
    return {
      date,
      planned_calories: toNumber(targets?.daily_calories, 0),
      has_targets: Boolean(targets),
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      water_ml: water[date] ?? 0,
      logs: dayLogs
    } satisfies DailyNutritionSummary;
  });
}

export type CustomMealInput = {
  id?: string;
  userId: string;
  mealName: string;
  mealCategory?: string | null;
  notes?: string | null;
  isFavorite?: boolean;
  items: Array<{ food: FoodLibraryItem; quantity: number }>;
};

function mealItemTotals(food: FoodLibraryItem, quantity: number) {
  return scaleFoodMacros(food, Math.max(0.1, quantity));
}

function summarizeMeal(items: MealItem[]) {
  return sumFoodLogs(items);
}

async function foodsById(foodIds: string[], userFoodIds: string[]) {
  const [globalResult, userResult] = await Promise.all([
    foodIds.length ? supabase!.from("food_items").select("*").in("id", foodIds) : Promise.resolve({ data: [], error: null }),
    userFoodIds.length ? supabase!.from("user_food_items").select("*").in("id", userFoodIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (globalResult.error) console.warn("Plaivra could not hydrate meal foods.", globalResult.error.message);
  if (userResult.error) console.warn("Plaivra could not hydrate custom meal foods.", userResult.error.message);

  const map = new Map<string, FoodLibraryItem>();
  ((globalResult.data ?? []) as Record<string, unknown>[]).map(normalizeCatalogFood).forEach((food) => map.set(food.id, food));
  ((userResult.data ?? []) as Record<string, unknown>[]).map(normalizeUserFood).forEach((food) => map.set(food.id, food));
  return map;
}

export async function getCustomMeals(userId: string) {
  if (!canUseUserData(userId)) return [];

  const { data: meals, error } = await supabase!
    .from("meals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Plaivra could not load custom meals.", error.message);
    return [];
  }
  const mealRows = meals ?? [];
  if (!mealRows.length) return [];

  const mealIds = mealRows.map((meal) => meal.id);
  const { data: rawItems, error: itemError } = await supabase!.from("meal_food_items").select("*").in("meal_id", mealIds);
  if (itemError) throw itemError;

  const foodIds = Array.from(new Set((rawItems ?? []).map((item) => item.food_item_id).filter(Boolean))) as string[];
  const userFoodIds = Array.from(new Set((rawItems ?? []).map((item) => item.user_food_item_id).filter(Boolean))) as string[];
  const foodMap = await foodsById(foodIds, userFoodIds);

  const itemsByMeal = (rawItems ?? []).reduce<Record<string, MealItem[]>>((byMeal, item) => {
    const foodId = item.food_item_id || item.user_food_item_id;
    const food = foodId ? foodMap.get(foodId) : null;
    const quantity = toNumber(item.quantity, 1);
    const macros = food ? mealItemTotals(food, quantity) : { calories: null, protein_g: null, carbs_g: null, fat_g: null };
    const nextItem: MealItem = {
      id: item.id,
      meal_id: item.meal_id,
      food_item_id: item.food_item_id,
      user_food_item_id: item.user_food_item_id,
      food_name: food?.food_name ?? "Saved food",
      serving_size: food?.serving_size ?? "1 serving",
      quantity,
      ...macros
    };
    byMeal[item.meal_id] = [...(byMeal[item.meal_id] ?? []), nextItem];
    return byMeal;
  }, {});

  return mealRows.map((meal) => {
    const items = itemsByMeal[meal.id] ?? [];
    return {
      id: meal.id,
      user_id: meal.user_id,
      meal_name: meal.meal_name,
      meal_category: meal.meal_category ?? null,
      notes: meal.notes,
      is_favorite: Boolean(meal.is_favorite),
      created_at: meal.created_at,
      updated_at: meal.updated_at,
      items,
      totals: summarizeMeal(items)
    } satisfies CustomMeal;
  });
}

export async function upsertCustomMeal(input: CustomMealInput) {
  const cleanName = input.mealName.trim();
  if (!cleanName) throw new Error("Meal name is required.");
  if (!input.items.length) throw new Error("Add at least one food to the meal.");
  input.items.forEach((item) => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Meal food quantities must be greater than zero.");
  });

  if (!canUseUserData(input.userId)) {
    const items: MealItem[] = input.items.map((item) => {
      const macros = mealItemTotals(item.food, item.quantity);
      return {
        id: crypto.randomUUID(),
        meal_id: input.id ?? "mock-meal",
        food_item_id: item.food.is_global === false ? null : item.food.id,
        user_food_item_id: item.food.is_global === false ? item.food.id : null,
        food_name: item.food.food_name,
        serving_size: item.food.serving_size,
        quantity: item.quantity,
        ...macros
      };
    });
    const now = new Date().toISOString();
    return {
      id: input.id ?? crypto.randomUUID(),
      user_id: input.userId,
      meal_name: cleanName,
      meal_category: input.mealCategory ?? null,
      notes: input.notes ?? null,
      is_favorite: Boolean(input.isFavorite),
      created_at: now,
      updated_at: now,
      items,
      totals: summarizeMeal(items)
    } as CustomMeal;
  }

  const mealPayload = {
    user_id: input.userId,
    meal_name: cleanName,
    meal_category: input.mealCategory?.trim() || null,
    notes: input.notes?.trim() || null,
    is_favorite: Boolean(input.isFavorite)
  };

  const mealRequest =
    input.id && isUuid(input.id)
      ? supabase!.from("meals").update(mealPayload).eq("id", input.id).eq("user_id", input.userId)
      : supabase!.from("meals").insert(mealPayload);
  const { data: meal, error } = await mealRequest.select("*").single();
  if (error) throw error;

  const deleteResult = await supabase!.from("meal_food_items").delete().eq("meal_id", meal.id);
  if (deleteResult.error) throw deleteResult.error;

  const rows = input.items.map((item) => ({
    meal_id: meal.id,
    food_item_id: item.food.is_global !== false && isUuid(item.food.id) ? item.food.id : null,
    user_food_item_id: item.food.is_global === false && isUuid(item.food.id) ? item.food.id : null,
    quantity: item.quantity
  }));
  const { error: itemError } = await supabase!.from("meal_food_items").insert(rows);
  if (itemError) throw itemError;

  const meals = await getCustomMeals(input.userId);
  return meals.find((savedMeal) => savedMeal.id === meal.id) ?? meals[0];
}

export async function deleteCustomMeal(userId: string, mealId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!.from("meals").delete().eq("id", mealId).eq("user_id", userId);
  if (error) throw error;
  return true;
}

export async function addCustomMealToLog(userId: string, meal: CustomMeal, date = todayIso(), mealType: MealType = "Breakfast") {
  const payload = {
    user_id: userId,
    food_item_id: null,
    user_food_item_id: null,
    log_date: date,
    meal_type: normalizeMealType(mealType),
    food_name: meal.meal_name,
    serving_size: `${meal.items.length} foods`,
    quantity: 1,
    calories: meal.totals.calories,
    protein_g: meal.totals.protein_g,
    carbs_g: meal.totals.carbs_g,
    fat_g: meal.totals.fat_g,
    notes: meal.notes
  };
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeFrozenFoodLog(data as Record<string, unknown>);
}

export async function addCustomMealToMealPlan(userId: string, meal: CustomMeal, mealType: MealType = "Breakfast", date = todayIso()) {
  const safeMealType = normalizeMealType(mealType);
  const payload = {
    user_id: userId,
    plan_date: date,
    meal_type: safeMealType,
    food_item_id: null,
    user_food_item_id: null,
    food_name: meal.meal_name,
    serving_size: `${meal.items.length} foods`,
    quantity: 1,
    calories: meal.totals.calories,
    protein_g: meal.totals.protein_g,
    carbs_g: meal.totals.carbs_g,
    fat_g: meal.totals.fat_g,
    status: "planned",
    food_log_id: null,
    completed_at: null,
    notes: meal.notes
  };

  if (!canUseUserData(userId)) throw new Error("User session invalid");

  const { data, error } = await supabase!.from("user_meal_plan_items").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeFrozenMealPlanItem(data as Record<string, unknown>);
}

export async function getTodayMealPlanItems(userId: string, date = todayIso()) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", date)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Plaivra could not load today's meal plan.", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(normalizeFrozenMealPlanItem);
}

export async function addFoodToMealPlan({
  userId,
  food,
  quantity,
  mealType = "Breakfast"
}: {
  userId: string;
  food: FoodLibraryItem;
  quantity: number;
  mealType?: MealType;
}) {
  const safeMealType = normalizeMealType(mealType);
  const isGlobalFood = food.is_global !== false;
  if (!canUseUserData(userId)) throw new Error("User session invalid");

  let payload: Record<string, unknown>;
  if (isGlobalFood) {
    const handoff = await resolveBrowserCatalogHandoff(userId, food, quantity);
    payload = {
      user_id: userId,
      plan_date: todayIso(),
      meal_type: safeMealType,
      food_item_id: handoff.foodId,
      user_food_item_id: null,
      food_name: handoff.name,
      serving_size: handoff.serving,
      quantity: handoff.quantity,
      calories: handoff.frozenNutrition.calories,
      protein_g: handoff.frozenNutrition.protein_g,
      carbs_g: handoff.frozenNutrition.carbs_g,
      fat_g: handoff.frozenNutrition.fat_g,
      status: "planned",
      food_log_id: null,
      completed_at: null,
      notes: null
    };
  } else {
    payload = {
      user_id: userId,
      plan_date: todayIso(),
      meal_type: safeMealType,
      food_item_id: null,
      user_food_item_id: isUuid(food.id) ? food.id : null,
      food_name: food.food_name,
      serving_size: food.serving_size,
      quantity,
      ...scaleFoodMacros(food, quantity),
      status: "planned",
      food_log_id: null,
      completed_at: null,
      notes: null
    };
  }

  const { data, error } = await supabase!.from("user_meal_plan_items").insert(payload).select("*").single();
  if (error) {
    console.warn("Plaivra could not add this food to My Meal Plan.", error.message);
    throw error;
  }
  return normalizeFrozenMealPlanItem(data as Record<string, unknown>);
}

export async function markMealPlanItemDone(item: MealPlanItem) {
  if (item.status === "skipped") throw new Error("A skipped meal cannot be marked done.");
  if (!canUseUserData(item.user_id)) {
    return {
      item: {
        ...item,
        status: "done",
        food_log_id: item.food_log_id ?? crypto.randomUUID(),
        completed_at: item.completed_at ?? new Date().toISOString()
      } as MealPlanItem,
      log: null as FoodLog | null,
      already_done: item.status === "done" || Boolean(item.food_log_id)
    };
  }

  const latestResult = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("id", item.id)
    .eq("user_id", item.user_id)
    .maybeSingle();
  if (latestResult.error) throw latestResult.error;
  if (!latestResult.data) throw new Error("Meal plan item not found.");

  const latest = normalizeFrozenMealPlanItem(latestResult.data as Record<string, unknown>);
  if (latest.status === "skipped") throw new Error("A skipped meal cannot be marked done.");
  if (latest.status === "done" || latest.food_log_id) return { item: latest, log: null as FoodLog | null, already_done: true };

  const completedAt = new Date().toISOString();
  const claimed = await supabase!
    .from("user_meal_plan_items")
    .update({ status: "done", completed_at: completedAt })
    .eq("id", latest.id)
    .eq("user_id", latest.user_id)
    .is("food_log_id", null)
    .eq("status", "planned")
    .select("*")
    .maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) {
    const reread = await supabase!
      .from("user_meal_plan_items")
      .select("*")
      .eq("id", latest.id)
      .eq("user_id", latest.user_id)
      .maybeSingle();
    if (reread.error) throw reread.error;
    return {
      item: reread.data ? normalizeFrozenMealPlanItem(reread.data as Record<string, unknown>) : latest,
      log: null as FoodLog | null,
      already_done: true
    };
  }

  const claimedItem = normalizeFrozenMealPlanItem(claimed.data as Record<string, unknown>);

  const logPayload = {
    user_id: claimedItem.user_id,
    food_item_id: claimedItem.food_item_id,
    user_food_item_id: claimedItem.user_food_item_id,
    log_date: claimedItem.plan_date,
    meal_type: claimedItem.meal_type,
    food_name: claimedItem.food_name,
    serving_size: claimedItem.serving_size,
    quantity: claimedItem.quantity,
    calories: claimedItem.calories,
    protein_g: claimedItem.protein_g,
    carbs_g: claimedItem.carbs_g,
    fat_g: claimedItem.fat_g,
    notes: claimedItem.notes
  };

  const inserted = await supabase!.from("food_logs").insert(logPayload).select("*").single();
  if (inserted.error) throw inserted.error;

  const updated = await supabase!
    .from("user_meal_plan_items")
    .update({ food_log_id: inserted.data.id, completed_at: completedAt })
    .eq("id", claimedItem.id)
    .eq("user_id", claimedItem.user_id)
    .select("*")
    .single();

  if (updated.error) throw updated.error;
  return {
    item: normalizeFrozenMealPlanItem(updated.data as Record<string, unknown>),
    log: normalizeFrozenFoodLog(inserted.data as Record<string, unknown>),
    already_done: false
  };
}

export async function deleteMealPlanItem(item: MealPlanItem) {
  if (!canUseUserData(item.user_id)) throw new Error("User session invalid");

  const { error } = await supabase!.from("user_meal_plan_items").delete().eq("id", item.id);
  if (error) throw error;
  return true;
}

export async function updateMealPlanItem(
  item: MealPlanItem,
  patch: { mealType?: MealType; quantity?: number; notes?: string | null }
) {
  const previousQuantity = Math.max(0.1, toNumber(item.quantity, 1));
  const nextQuantity = Math.max(0.1, toNumber(patch.quantity ?? item.quantity, previousQuantity));
  const ratio = nextQuantity / previousQuantity;
  const macros = scaleFoodMacros(item, ratio);
  const payload = {
    meal_type: normalizeMealType(patch.mealType ?? item.meal_type),
    quantity: nextQuantity,
    ...macros,
    notes: patch.notes ?? item.notes ?? null
  };

  if (!canUseUserData(item.user_id)) throw new Error("User session invalid");

  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .update(payload)
    .eq("id", item.id)
    .eq("user_id", item.user_id)
    .select("*")
    .single();
  if (error) throw error;

  if (item.food_log_id) {
    const logUpdate = await supabase!
      .from("food_logs")
      .update({
        meal_type: payload.meal_type,
        quantity: payload.quantity,
        calories: payload.calories,
        protein_g: payload.protein_g,
        carbs_g: payload.carbs_g,
        fat_g: payload.fat_g,
        notes: payload.notes
      })
      .eq("id", item.food_log_id)
      .eq("user_id", item.user_id);
    if (logUpdate.error) console.warn("Plaivra could not sync the linked calorie log.", logUpdate.error.message);
  }

  return normalizeFrozenMealPlanItem(data as Record<string, unknown>);
}

export async function addCustomFoodLog(payload: Omit<FoodLog, "id">) {
  if (!canUseUserData(payload.user_id)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeFrozenFoodLog(data as Record<string, unknown>);
}

export async function updateFoodLogQuantity(log: FoodLog, quantity: number) {
  const ratio = quantity / log.quantity;
  const macros = scaleFoodMacros(log, ratio);
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!
    .from("food_logs")
    .update({ quantity, ...macros })
    .eq("id", log.id)
    .select("*")
    .single();
  if (error) throw error;
  return normalizeFrozenFoodLog(data as Record<string, unknown>);
}

export async function deleteFoodLog(id: string) {
  if (!supabase) throw new Error("Database not connected");
  const { error } = await supabase!.from("food_logs").delete().eq("id", id);
  if (error) {
    console.warn("Plaivra could not delete this food log.", error.message);
    throw error;
  }
  return true;
}

export async function copyYesterdaysMeals(userId: string, targetDate = todayIso()) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const yesterday = new Date(`${targetDate}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const sourceDate = yesterday.toLocaleDateString("en-CA");
  const { data, error } = await supabase!.from("food_logs").select("*").eq("user_id", userId).eq("log_date", sourceDate);
  if (error) {
    console.warn("Plaivra could not copy yesterday's meals.", error.message);
    return [];
  }
  const copies = (data ?? []).map(({ id: _id, created_at: _created, ...log }) => ({ ...log, log_date: targetDate }));
  if (!copies.length) return [];
  const inserted = await supabase!.from("food_logs").insert(copies).select("*");
  if (inserted.error) throw inserted.error;
  return ((inserted.data ?? []) as Record<string, unknown>[]).map(normalizeFrozenFoodLog);
}
