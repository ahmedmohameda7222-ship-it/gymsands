export type RecipeDraftIngredientFact = {
  ingredient_name: string;
  quantity?: number | null;
  unit?: string | null;
};

export type RecipeDraftInstructionFact = {
  instruction: string;
};

export type RecipeDraftReadinessInput = {
  name?: string | null;
  servings?: number | null;
  ingredients?: readonly RecipeDraftIngredientFact[];
  instructions?: readonly RecipeDraftInstructionFact[];
};

export type RecipeDraftMissingField = "name" | "servings" | "ingredient" | "instruction";

export function evaluateRecipeDraftReadiness(input: RecipeDraftReadinessInput): {
  ready: boolean;
  missing: RecipeDraftMissingField[];
} {
  const missing: RecipeDraftMissingField[] = [];
  if (!input.name?.trim()) missing.push("name");
  if (typeof input.servings !== "number" || !Number.isFinite(input.servings) || input.servings <= 0) missing.push("servings");
  if (!input.ingredients?.some((item) => item.ingredient_name?.trim())) missing.push("ingredient");
  if (!input.instructions?.some((item) => item.instruction?.trim())) missing.push("instruction");
  return { ready: missing.length === 0, missing };
}

export function assertRecipeDraftReady(input: RecipeDraftReadinessInput) {
  const readiness = evaluateRecipeDraftReadiness(input);
  if (!readiness.ready) {
    throw new Error(`Recipe Working Draft is not ready: missing ${readiness.missing.join(", ")}.`);
  }
  return readiness;
}

export function nextRecipeVersionNumber(versions: readonly { version_number: number }[]) {
  const highest = versions.reduce((max, item) => {
    const value = Number(item.version_number);
    return Number.isInteger(value) && value > max ? value : max;
  }, 0);
  return highest + 1;
}
