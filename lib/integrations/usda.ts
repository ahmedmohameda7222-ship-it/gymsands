import type { NormalizedFood } from "@/lib/integrations/open-food-facts";

function nutrient(food: any, names: string[]) {
  const match = (food?.foodNutrients ?? []).find((item: any) => {
    const name = String(item.nutrientName ?? item.nutrient?.name ?? "").toLowerCase();
    return names.some((candidate) => name.includes(candidate));
  });
  const value = Number(match?.value ?? match?.amount);
  return Number.isFinite(value) ? value : null;
}

export function normalizeUsdaFood(food: any): NormalizedFood {
  return {
    source: "usda",
    source_id: String(food.fdcId),
    name: food.description || "USDA food",
    brand: food.brandOwner || food.brandName || undefined,
    serving_size: food.servingSize && food.servingSizeUnit ? `${food.servingSize}${food.servingSizeUnit}` : undefined,
    calories: nutrient(food, ["energy"]),
    protein: nutrient(food, ["protein"]),
    carbs: nutrient(food, ["carbohydrate"]),
    fat: nutrient(food, ["total lipid", "fat"]),
    fiber: nutrient(food, ["fiber"]),
    sugar: nutrient(food, ["sugars"]),
    sodium: nutrient(food, ["sodium"]),
    raw_data: food
  };
}

export async function searchUsdaFoods(query: string, apiKey: string) {
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, pageSize: 25 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "USDA search failed.");
  return (data.foods ?? []).map(normalizeUsdaFood);
}

export async function getUsdaFoodDetail(fdcId: string, apiKey: string) {
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${encodeURIComponent(apiKey)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "USDA detail lookup failed.");
  return normalizeUsdaFood(data);
}
