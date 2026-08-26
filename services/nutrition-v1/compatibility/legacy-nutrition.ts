import type { SupabaseClient } from "@supabase/supabase-js";

export type LegacySavedContentClassification = "recipe" | "saved_meal" | "template" | "unresolved";

export type LegacyNutritionFacts = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type LegacyIngredientCompatibility = {
  source_id: string;
  name: string;
  quantity: number | null;
  serving_label: string | null;
  nutrition: LegacyNutritionFacts;
};

export type LegacySavedContentCompatibility = {
  source_table: "saved_recipes" | "custom_meals";
  source_id: string;
  owner_id: string;
  classification: LegacySavedContentClassification;
  unresolved_reason: string | null;
  name: string;
  portions: number | null;
  notes: string | null;
  meal_category: string | null;
  is_favorite: boolean;
  source_custom_meal_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  ingredients: LegacyIngredientCompatibility[];
};

export type LegacyPlannedOccurrenceCompatibility = {
  source_table: "user_meal_plan_items";
  source_id: string;
  owner_id: string;
  canonical_kind: "planned_occurrence";
  plan_date: string;
  meal_slot_key: string;
  name: string;
  serving_label: string | null;
  quantity: number | null;
  nutrition: LegacyNutritionFacts;
  status: string;
  linked_food_log_id: string | null;
};

export type LegacyDiaryActualCompatibility = {
  source_table: "food_logs";
  source_id: string;
  owner_id: string;
  canonical_kind: "diary_actual";
  log_date: string;
  meal_type: string;
  name: string;
  serving_label: string | null;
  quantity: number | null;
  food_id: string | null;
  user_food_id: string | null;
  nutrition: LegacyNutritionFacts;
};

type LegacyRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, fallback: string) {
  return text(value) ?? fallback;
}

function nullableNonNegative(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nullablePositive(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nutrition(row: LegacyRow): LegacyNutritionFacts {
  return {
    calories: nullableNonNegative(row.calories),
    protein_g: nullableNonNegative(row.protein_g),
    carbs_g: nullableNonNegative(row.carbs_g),
    fat_g: nullableNonNegative(row.fat_g),
  };
}

export function classifyLegacySavedRecipe(row: LegacyRow): {
  classification: LegacySavedContentClassification;
  unresolved_reason: string | null;
} {
  const rawType = text(row.saved_item_type)?.toLowerCase() ?? null;
  const customMealLink = text(row.source_custom_meal_id);

  if (rawType === "meal") {
    return { classification: "saved_meal", unresolved_reason: null };
  }
  if (rawType === "template") {
    if (customMealLink) {
      return {
        classification: "unresolved",
        unresolved_reason: "Legacy template conflicts with custom-meal lineage.",
      };
    }
    return { classification: "template", unresolved_reason: null };
  }
  if (rawType === "recipe") {
    if (customMealLink) {
      return {
        classification: "unresolved",
        unresolved_reason: "Legacy Recipe label conflicts with custom-meal lineage.",
      };
    }
    return { classification: "recipe", unresolved_reason: null };
  }
  return {
    classification: "unresolved",
    unresolved_reason: "Legacy saved content has no explicit supported saved_item_type.",
  };
}

function mapLegacyIngredient(row: LegacyRow): LegacyIngredientCompatibility {
  return {
    source_id: requiredText(row.id, "unknown-legacy-ingredient"),
    name: requiredText(row.food_name, "Legacy ingredient"),
    quantity: nullablePositive(row.quantity),
    serving_label: text(row.serving_unit ?? row.serving_size),
    nutrition: nutrition(row),
  };
}

export function mapLegacySavedRecipe(
  row: LegacyRow,
  ingredientRows: LegacyRow[] = [],
): LegacySavedContentCompatibility {
  const classification = classifyLegacySavedRecipe(row);
  return {
    source_table: "saved_recipes",
    source_id: requiredText(row.id, "unknown-legacy-saved-content"),
    owner_id: requiredText(row.user_id, "unknown-owner"),
    classification: classification.classification,
    unresolved_reason: classification.unresolved_reason,
    name: requiredText(row.name, "Legacy saved content"),
    portions: nullablePositive(row.portions),
    notes: text(row.notes),
    meal_category: text(row.meal_category),
    is_favorite: row.is_favorite === true,
    source_custom_meal_id: text(row.source_custom_meal_id),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    ingredients: ingredientRows.map(mapLegacyIngredient),
  };
}

export function mapLegacyCustomMeal(
  row: LegacyRow,
  itemRows: LegacyRow[] = [],
): LegacySavedContentCompatibility {
  return {
    source_table: "custom_meals",
    source_id: requiredText(row.id, "unknown-legacy-custom-meal"),
    owner_id: requiredText(row.user_id, "unknown-owner"),
    classification: "saved_meal",
    unresolved_reason: null,
    name: requiredText(row.meal_name, "Legacy custom meal"),
    portions: 1,
    notes: text(row.notes),
    meal_category: text(row.meal_category),
    is_favorite: row.is_favorite === true,
    source_custom_meal_id: requiredText(row.id, "unknown-legacy-custom-meal"),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    ingredients: itemRows.map(mapLegacyIngredient),
  };
}

export function mapLegacyMealPlanItem(row: LegacyRow): LegacyPlannedOccurrenceCompatibility {
  return {
    source_table: "user_meal_plan_items",
    source_id: requiredText(row.id, "unknown-legacy-plan-item"),
    owner_id: requiredText(row.user_id, "unknown-owner"),
    canonical_kind: "planned_occurrence",
    plan_date: requiredText(row.plan_date, "unknown-date"),
    meal_slot_key: requiredText(row.meal_type, "Meal"),
    name: requiredText(row.food_name, "Legacy planned item"),
    serving_label: text(row.serving_size),
    quantity: nullablePositive(row.quantity),
    nutrition: nutrition(row),
    status: requiredText(row.status, "planned"),
    linked_food_log_id: text(row.food_log_id),
  };
}

export function mapLegacyFoodLog(row: LegacyRow): LegacyDiaryActualCompatibility {
  return {
    source_table: "food_logs",
    source_id: requiredText(row.id, "unknown-legacy-food-log"),
    owner_id: requiredText(row.user_id, "unknown-owner"),
    canonical_kind: "diary_actual",
    log_date: requiredText(row.log_date, "unknown-date"),
    meal_type: requiredText(row.meal_type, "Meal"),
    name: requiredText(row.food_name, "Legacy food log"),
    serving_label: text(row.serving_size),
    quantity: nullablePositive(row.quantity),
    food_id: text(row.food_item_id),
    user_food_id: text(row.user_food_item_id),
    nutrition: nutrition(row),
  };
}

export async function readLegacySavedContent(
  client: SupabaseClient,
  userId: string,
  { limit = 200 }: { limit?: number } = {},
): Promise<LegacySavedContentCompatibility[]> {
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const [savedResult, customMealResult] = await Promise.all([
    client
      .from("saved_recipes")
      .select("id,user_id,name,portions,notes,created_at,updated_at,saved_item_type,meal_category,is_favorite,source_custom_meal_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(boundedLimit),
    client
      .from("custom_meals")
      .select("id,user_id,meal_name,meal_category,is_favorite,notes,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(boundedLimit),
  ]);
  if (savedResult.error) throw savedResult.error;
  if (customMealResult.error) throw customMealResult.error;

  const savedRows = (savedResult.data ?? []) as LegacyRow[];
  const customMealRows = (customMealResult.data ?? []) as LegacyRow[];
  const savedIds = savedRows.map((row) => text(row.id)).filter((id): id is string => Boolean(id));
  const customMealIds = customMealRows.map((row) => text(row.id)).filter((id): id is string => Boolean(id));

  const [ingredientResult, customItemResult] = await Promise.all([
    savedIds.length
      ? client.from("saved_recipe_ingredients").select("id,recipe_id,food_name,quantity,serving_unit,calories,protein_g,carbs_g,fat_g").eq("user_id", userId).in("recipe_id", savedIds)
      : Promise.resolve({ data: [], error: null }),
    customMealIds.length
      ? client.from("custom_meal_items").select("id,meal_id,food_name,quantity,serving_size,calories,protein_g,carbs_g,fat_g").in("meal_id", customMealIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (ingredientResult.error) throw ingredientResult.error;
  if (customItemResult.error) throw customItemResult.error;

  const ingredients = (ingredientResult.data ?? []) as LegacyRow[];
  const customItems = (customItemResult.data ?? []) as LegacyRow[];

  return [
    ...savedRows.map((row) => mapLegacySavedRecipe(
      row,
      ingredients.filter((ingredient) => ingredient.recipe_id === row.id),
    )),
    ...customMealRows.map((row) => mapLegacyCustomMeal(
      row,
      customItems.filter((item) => item.meal_id === row.id),
    )),
  ];
}
