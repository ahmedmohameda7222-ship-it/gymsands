import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentGenerationQuality = {
  available: boolean;
  generationId: string | null;
  activeFoodCount: number | null;
  foodsMissingMacros: number | null;
  duplicateSelectedNames: number | null;
};

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function dbError(label: string, error: { message?: string } | null) {
  if (error) throw new Error(`${label}: ${error.message ?? "database error"}`);
}

export async function getCurrentGenerationQuality(
  supabase: SupabaseClient,
): Promise<CurrentGenerationQuality> {
  const pointer = await supabase
    .from("food_catalog_current_generation")
    .select("current_generation_id")
    .eq("singleton_key", true)
    .maybeSingle();
  dbError("Current generation pointer", pointer.error);

  const generationId = typeof pointer.data?.current_generation_id === "string"
    ? pointer.data.current_generation_id
    : null;
  if (!generationId) {
    return {
      available: false,
      generationId: null,
      activeFoodCount: null,
      foodsMissingMacros: null,
      duplicateSelectedNames: null,
    };
  }

  const foodsResult = await supabase
    .from("food_catalog_generation_foods")
    .select("food_id,nutrition_revision_id,lifecycle")
    .eq("generation_id", generationId)
    .eq("lifecycle", "active")
    .limit(5000);
  dbError("Current generation Foods", foodsResult.error);

  const foods = rows(foodsResult.data);
  const activeFoodIds = Array.from(new Set(
    foods.map((food) => typeof food.food_id === "string" ? food.food_id : null)
      .filter((id): id is string => Boolean(id)),
  ));
  const namesSelectionResult = activeFoodIds.length
    ? await supabase
        .from("food_catalog_generation_names")
        .select("food_id,name_fact_id")
        .eq("generation_id", generationId)
        .in("food_id", activeFoodIds)
        .limit(10000)
    : { data: [], error: null };
  dbError("Current generation Name selections", namesSelectionResult.error);

  const nutritionIds = Array.from(new Set(
    foods.map((food) => typeof food.nutrition_revision_id === "string" ? food.nutrition_revision_id : null)
      .filter((id): id is string => Boolean(id)),
  ));
  const nameIds = Array.from(new Set(
    rows(namesSelectionResult.data)
      .map((selection) => typeof selection.name_fact_id === "string" ? selection.name_fact_id : null)
      .filter((id): id is string => Boolean(id)),
  ));

  const [nutritionResult, namesResult] = await Promise.all([
    nutritionIds.length
      ? supabase
          .from("food_nutrition_revisions")
          .select("id,calories,protein_g,carbs_g,fat_g")
          .in("id", nutritionIds)
      : Promise.resolve({ data: [], error: null }),
    nameIds.length
      ? supabase
          .from("food_names")
          .select("id,language_tag,normalized_text,name_text")
          .in("id", nameIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  dbError("Selected current nutrition", nutritionResult.error);
  dbError("Selected current Names", namesResult.error);

  const nutritionById = new Map(
    rows(nutritionResult.data)
      .filter((row) => typeof row.id === "string")
      .map((row) => [row.id as string, row]),
  );
  const foodsMissingMacros = foods.filter((food) => {
    const revisionId = typeof food.nutrition_revision_id === "string" ? food.nutrition_revision_id : null;
    if (!revisionId) return true;
    const nutrition = nutritionById.get(revisionId);
    if (!nutrition) return true;
    return ["calories", "protein_g", "carbs_g", "fat_g"].some(
      (key) => nutrition[key] === null || nutrition[key] === undefined,
    );
  }).length;

  const selectedNameCounts = new Map<string, number>();
  for (const name of rows(namesResult.data)) {
    const language = typeof name.language_tag === "string" ? name.language_tag.trim().toLowerCase() : "";
    const normalized = typeof name.normalized_text === "string" && name.normalized_text.trim()
      ? name.normalized_text.trim()
      : typeof name.name_text === "string"
        ? name.name_text.trim().toLocaleLowerCase()
        : "";
    if (!normalized) continue;
    const key = `${language}|${normalized}`;
    selectedNameCounts.set(key, (selectedNameCounts.get(key) ?? 0) + 1);
  }

  return {
    available: true,
    generationId,
    activeFoodCount: foods.length,
    foodsMissingMacros,
    duplicateSelectedNames: Array.from(selectedNameCounts.values()).filter((count) => count > 1).length,
  };
}
