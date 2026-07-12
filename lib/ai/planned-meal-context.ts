import type { MealPlanItem } from "@/types";

export type PlannedMealPromptContext = {
  name: string;
  mealType: string;
  date: string;
  servingSize: string | null;
  quantity: number | null;
  ingredients: string[];
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  preparationTimeMinutes: number | null;
  structuredAllergens: string[];
};

export type MealPromptRelevance = {
  dairy: boolean;
  gluten: boolean;
};

const dairyTerms = ["milk", "yogurt", "yoghurt", "cheese", "butter", "cream", "whey", "casein", "labneh", "sour cream"];
const glutenTerms = ["wheat", "wheat flour", "bread", "pasta", "bulgur", "couscous", "semolina", "breadcrumb", "breadcrumbs", "barley", "rye", "wheat tortilla", "wheat wrap"];

export function normalizeIngredientText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function exactAllergen(values: string[], allergen: "dairy" | "gluten") {
  return values.some((value) => {
    const normalized = normalizeIngredientText(value);
    if (!normalized || normalized.includes(`${allergen} free`) || normalized.includes(`no ${allergen}`)) return false;
    if (allergen === "dairy") return ["dairy", "milk", "casein", "whey"].includes(normalized);
    return ["gluten", "wheat", "barley", "rye"].includes(normalized);
  });
}

function containsTerm(value: string, term: string) {
  const normalized = normalizeIngredientText(value);
  const escaped = normalizeIngredientText(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "u").test(normalized);
}

function ingredientContainsAny(ingredients: string[], terms: string[]) {
  return ingredients.some((ingredient) => terms.some((term) => containsTerm(ingredient, term)));
}

export function detectMealPromptRelevance(context: Pick<PlannedMealPromptContext, "ingredients" | "structuredAllergens">): MealPromptRelevance {
  const structuredDairy = exactAllergen(context.structuredAllergens, "dairy");
  const structuredGluten = exactAllergen(context.structuredAllergens, "gluten");
  const dairy = structuredDairy || ingredientContainsAny(context.ingredients, dairyTerms);
  const explicitGlutenOats = context.ingredients.some((ingredient) => {
    const normalized = normalizeIngredientText(ingredient);
    return normalized.includes("gluten containing oats") || normalized.includes("oats contains gluten") || normalized.includes("contaminated oats");
  });
  const gluten = structuredGluten || ingredientContainsAny(context.ingredients, glutenTerms) || explicitGlutenOats;
  return { dairy, gluten };
}

export function ingredientsFromFoodMetadata({ foodName, tags, notes }: { foodName: string; tags?: string[] | null; notes?: string | null }) {
  const safeTags = tags ?? [];
  const noteParts = (notes ?? "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 80);
  return Array.from(new Set([foodName.trim(), ...safeTags.map((tag) => tag.trim()), ...noteParts].filter(Boolean)));
}

export function buildPlannedMealPromptContext(
  item: MealPlanItem,
  metadata?: { ingredients?: string[]; structuredAllergens?: string[]; preparationTimeMinutes?: number | null }
): PlannedMealPromptContext {
  const numberOrNull = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    name: item.food_name,
    mealType: item.meal_type,
    date: item.plan_date,
    servingSize: item.serving_size || null,
    quantity: numberOrNull(item.quantity),
    ingredients: Array.from(new Set((metadata?.ingredients ?? [item.food_name]).map((value) => value.trim()).filter(Boolean))),
    calories: numberOrNull(item.calories),
    proteinG: numberOrNull(item.protein_g),
    carbsG: numberOrNull(item.carbs_g),
    fatG: numberOrNull(item.fat_g),
    preparationTimeMinutes: metadata?.preparationTimeMinutes ?? null,
    structuredAllergens: Array.from(new Set((metadata?.structuredAllergens ?? []).map((value) => value.trim()).filter(Boolean)))
  };
}
