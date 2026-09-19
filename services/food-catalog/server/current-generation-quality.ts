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

  const selectedNameCounts = new Map<string, number>();
  for (const name of facts.names) {
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
