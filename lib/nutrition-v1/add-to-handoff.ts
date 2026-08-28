export type AddToDestination = "diary" | "meal_plan" | "saved_meal" | "recipe";

export type AddToHandoffSource =
  | { type: "food"; id: string; source: "catalog" | "my_food"; quantity: number; serving: string }
  | { type: "recipe"; id: string; versionId: string };

export function parseAddToHandoff(search: URLSearchParams, destination: AddToDestination): AddToHandoffSource | null {
  const explicitDestination = search.get("destination");
  if (explicitDestination && explicitDestination !== destination) return null;

  const foodKey = destination === "saved_meal" ? "savedMealFoodId" : destination === "recipe" ? "ingredientFoodId" : "addFoodId";
  const foodId = search.get(foodKey);
  if (foodId) {
    const source = search.get("source");
    const quantity = Number(search.get("quantity"));
    const serving = search.get("serving")?.trim() ?? "";
    if ((source !== "catalog" && source !== "my_food") || !Number.isFinite(quantity) || quantity <= 0 || !serving) return null;
    return { type: "food", id: foodId, source, quantity, serving };
  }

  if (destination !== "recipe" && search.get("source") === "recipe") {
    const id = search.get("recipeId");
    const versionId = search.get("recipeVersionId");
    if (id && versionId) return { type: "recipe", id, versionId };
  }
  return null;
}
