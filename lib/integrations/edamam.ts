export async function parseEdamamMeal(text: string, appId: string, appKey: string) {
  const response = await fetch(
    `https://api.edamam.com/api/nutrition-details?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "FitLife Hub meal", ingr: text.split(/\n|,| and /i).map((item) => item.trim()).filter(Boolean) })
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "Edamam could not parse that meal.");
  return data;
}
