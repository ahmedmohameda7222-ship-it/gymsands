export type AddToDestination = "diary" | "meal_plan" | "saved_meal" | "recipe";

export type AddToHandoffSource =
  | {
      type: "food";
      id: string;
      source: "catalog" | "my_food";
      quantity: number;
      serving: string;
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
    const quantity = Number(search.get("quantity"));
    const serving = search.get("serving")?.trim() ?? "";
    const displayName = search.get("displayName")?.trim() || null;
    const languageTag = search.get("languageTag")?.trim() || null;
    if ((source !== "catalog" && source !== "my_food") || !Number.isFinite(quantity) || quantity <= 0 || !serving) return null;
    if (source === "catalog" && displayName === null) return null;
    return { type: "food", id: foodId, source, quantity, serving, displayName, languageTag };
  }

  if (destination !== "recipe" && search.get("source") === "recipe") {
    const id = search.get("recipeId");
    const versionId = search.get("recipeVersionId");
    const rawQuantity = search.get("quantity");
    const quantity = rawQuantity === null || rawQuantity.trim() === "" ? 1 : Number(rawQuantity);
    if (id && versionId && Number.isFinite(quantity) && quantity > 0) return { type: "recipe", id, versionId, quantity };
  }
  return null;
}
