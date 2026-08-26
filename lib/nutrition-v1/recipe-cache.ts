export type RecipeNutritionPerServing = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type PublishedRecipeCacheIngredient = {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  foodId: string | null;
  verified: boolean;
};

export type PublishedRecipeCacheSnapshot = {
  status: "published";
  recipeId: string;
  recipeVersionId: string;
  versionNumber: number;
  name: string;
  servings: number;
  totalTimeMinutes: number | null;
  cuisine: string | null;
  favorite: boolean;
  coverPhotoUrl: string | null;
  ingredients: PublishedRecipeCacheIngredient[];
  instructions: string[];
  nutritionPerServing: RecipeNutritionPerServing | null;
  cachedAt: string;
};

export type ObjectiveRecipeFilter = "high-protein" | "low-carb";

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nullableFiniteNonNegative(value: unknown): value is number | null {
  return value === null || finiteNonNegative(value);
}

function assertPublishedSnapshot(snapshot: PublishedRecipeCacheSnapshot) {
  if (snapshot.status !== "published" || !snapshot.recipeId.trim() || !snapshot.recipeVersionId.trim()) {
    throw new Error("Only an identified published Recipe version may be cached.");
  }
  if (!Number.isInteger(snapshot.versionNumber) || snapshot.versionNumber < 1) throw new Error("Published Recipe version is invalid.");
  if (!snapshot.name.trim() || !finiteNonNegative(snapshot.servings) || snapshot.servings <= 0) throw new Error("Published Recipe identity is invalid.");
  if (!snapshot.cachedAt || Number.isNaN(Date.parse(snapshot.cachedAt))) throw new Error("Published Recipe cache timestamp is invalid.");
}

export function serializePublishedRecipeCache(snapshot: PublishedRecipeCacheSnapshot) {
  assertPublishedSnapshot(snapshot);
  return JSON.stringify(snapshot);
}

export function parsePublishedRecipeCache(value: string | null | undefined): PublishedRecipeCacheSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PublishedRecipeCacheSnapshot;
    assertPublishedSnapshot(parsed);
    if (!Array.isArray(parsed.ingredients) || !Array.isArray(parsed.instructions)) return null;
    if (parsed.nutritionPerServing) {
      const { calories, protein_g, carbs_g, fat_g } = parsed.nutritionPerServing;
      if (![calories, protein_g, carbs_g, fat_g].every(nullableFiniteNonNegative)) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function completeNutrition(value: RecipeNutritionPerServing | null): value is Required<RecipeNutritionPerServing> {
  if (!value) return false;
  return [value.calories, value.protein_g, value.carbs_g, value.fat_g].every(finiteNonNegative);
}

export function qualifiesForObjectiveRecipeFilter(filter: ObjectiveRecipeFilter, nutrition: RecipeNutritionPerServing | null) {
  if (!completeNutrition(nutrition)) return false;
  // V1 implementation thresholds are deliberately explicit and deterministic;
  // they never promote a Recipe when the required nutrition facts are unknown.
  if (filter === "high-protein") return nutrition.protein_g >= 30;
  return nutrition.carbs_g <= 30;
}

function quantityLabel(quantity: number | null, unit: string | null) {
  if (quantity === null) return "as needed";
  return `${quantity}${unit ? ` ${unit}` : ""}`;
}

export function buildFrozenRecipeShareText(snapshot: PublishedRecipeCacheSnapshot) {
  assertPublishedSnapshot(snapshot);
  const lines = [snapshot.name, `${snapshot.servings} servings`];
  if (snapshot.totalTimeMinutes !== null) lines.push(`${snapshot.totalTimeMinutes} min total`);
  lines.push("", "Ingredients");
  for (const item of snapshot.ingredients) lines.push(`- ${item.ingredientName} — ${quantityLabel(item.quantity, item.unit)}`);
  lines.push("", "Instructions");
  snapshot.instructions.forEach((instruction, index) => lines.push(`${index + 1}. ${instruction}`));
  if (snapshot.nutritionPerServing) {
    const n = snapshot.nutritionPerServing;
    lines.push("", "Nutrition per serving");
    const facts = [
      n.calories === null ? null : `${n.calories} kcal`,
      n.protein_g === null ? null : `P ${n.protein_g} g`,
      n.carbs_g === null ? null : `C ${n.carbs_g} g`,
      n.fat_g === null ? null : `F ${n.fat_g} g`,
    ].filter((fact): fact is string => Boolean(fact));
    if (facts.length) lines.push(facts.join(" · "));
  }
  return lines.join("\n");
}
