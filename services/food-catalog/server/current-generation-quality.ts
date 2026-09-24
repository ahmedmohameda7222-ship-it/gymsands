import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readSupabaseCurrentGenerationQualityFacts,
  readSupabaseCurrentGenerationQualitySelection,
} from "./supabase-generation-read-store";

const QUALITY_MACRO_KEYS = ["calories", "protein_g", "carbs_g", "fat_g"] as const;

export type CurrentGenerationQuality = {
  available: boolean;
  generationId: string | null;
  activeFoodCount: number | null;
  foodsMissingMacros: number | null;
  duplicateSelectedNames: number | null;
};

export async function getCurrentGenerationQuality(
  supabase: SupabaseClient,
): Promise<CurrentGenerationQuality> {
  const selection = await readSupabaseCurrentGenerationQualitySelection(supabase);
  const generationId = selection.generationId;
  if (!generationId) {
    return {
      available: false,
      generationId: null,
      activeFoodCount: null,
      foodsMissingMacros: null,
      duplicateSelectedNames: null,
    };
  }

  const foods = selection.foods;
  const nutritionIds = Array.from(new Set(
    foods
      .map((food) => food.nutritionRevisionId)
      .filter((id): id is string => id !== null),
  ));
  const nameIds = selection.nameFactIds;

  const facts = await readSupabaseCurrentGenerationQualityFacts(
    supabase,
    nutritionIds,
    nameIds,
  );

  const nutritionById = new Map(
    facts.nutrition.map((row) => [row.id, row]),
  );
  const foodsMissingMacros = foods.filter((food) => {
    const revisionId = food.nutritionRevisionId;
    if (!revisionId) return true;
    const nutrition = nutritionById.get(revisionId);
    if (!nutrition) return true;
    return QUALITY_MACRO_KEYS.some((key) => nutrition[key] === null);
  }).length;

  const selectedNameFoods = new Map<string, Set<string>>();
  for (const name of facts.names) {
    const language = name.languageTag.trim().toLowerCase();
    const normalized = name.normalizedText?.trim() ?? "";
    if (!normalized) continue;
    const key = `${language}|${normalized}`;
    const foodIds = selectedNameFoods.get(key) ?? new Set<string>();
    foodIds.add(name.foodId);
    selectedNameFoods.set(key, foodIds);
  }

  return {
    available: true,
    generationId,
    activeFoodCount: foods.length,
    foodsMissingMacros,
    duplicateSelectedNames: Array.from(selectedNameFoods.values()).filter((foodIds) => foodIds.size > 1).length,
  };
}
