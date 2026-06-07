function nutritionixHeaders(appId: string, apiKey: string) {
  return {
    "Content-Type": "application/json",
    "x-app-id": appId,
    "x-app-key": apiKey
  };
}

export async function parseNutritionixFood(query: string, appId: string, apiKey: string) {
  const response = await fetch("https://trackapi.nutritionix.com/v2/natural/nutrients", {
    method: "POST",
    headers: nutritionixHeaders(appId, apiKey),
    body: JSON.stringify({ query })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Nutritionix food parse failed.");
  return data;
}

export async function parseNutritionixExercise(query: string, appId: string, apiKey: string) {
  const response = await fetch("https://trackapi.nutritionix.com/v2/natural/exercise", {
    method: "POST",
    headers: nutritionixHeaders(appId, apiKey),
    body: JSON.stringify({ query })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Nutritionix exercise parse failed.");
  return data;
}
