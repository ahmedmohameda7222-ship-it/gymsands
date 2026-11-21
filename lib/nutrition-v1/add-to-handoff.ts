import { parsePositiveHandoffQueryQuantity, parseRecipeHandoffQueryQuantity } from "./handoff-quantity";

export type AddToDestination = "diary" | "meal_plan" | "saved_meal" | "recipe";

export type AddToHandoffSource =
  | {
      type: "food";
      id: string;
      source: "catalog" | "my_food";
      quantity: number;
      serving: string;
      servingOptionId: string | null;
      displayName: string | null;
      languageTag: string | null;
    }
  | { type: "recipe"; id: string; versionId: string; quantity: number };

export function parseAddToHandoff(search: URLSearchParams, destination: AddToDestination): AddToHandoffSource | null {
  const explicitDestination = search.get("destination");
  if (explicitDestination && explicitDestination !== destination) return null;

  const foodKey = destination === "saved_meal" ? "savedMealFoodId" : destination === "recipe" ? "ingredientFoodId" : "addFoodId";
  const foodId = search.get(foodKey);
  if (foodId) {
    const source = search.get("source");
    const quantity = parsePositiveHandoffQueryQuantity(search.get("quantity"));
    const serving = search.get("serving")?.trim() ?? "";
    const servingOptionId = search.get("servingOptionId")?.trim() || null;
    const displayName = search.get("displayName")?.trim() || null;
    const languageTag = search.get("languageTag")?.trim() || null;
    if ((source !== "catalog" && source !== "my_food") || quantity === null || !serving) return null;
    if (source === "catalog" && displayName === null) return null;
    return { type: "food", id: foodId, source, quantity, serving, servingOptionId, displayName, languageTag };
  }

  if (destination !== "recipe" && search.get("source") === "recipe") {
    const id = search.get("recipeId");
    const versionId = search.get("recipeVersionId");
    const quantity = parseRecipeHandoffQueryQuantity(search.get("quantity"));
    if (id && versionId && quantity !== null) return { type: "recipe", id, versionId, quantity };
  }
  return null;
}
