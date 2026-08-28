import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { clonePublishedRecipeGraphForDraft } from "@/lib/nutrition-v1/recipe-versioning";
import { isUuid } from "@/lib/utils";
import { getPublishedRecipeDetail } from "@/services/nutrition-v1/server/recipe-published";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function duplicatePublishedRecipeAtomically(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
  nextId: () => string = () => crypto.randomUUID(),
) {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  if (!isUuid(recipeId)) throw new Error("Recipe must be a valid ID.");

  const source = await getPublishedRecipeDetail(supabase, userId, recipeId);
  const version = source.latestVersion as Record<string, unknown> | null;
  if (!version || typeof version.id !== "string" || !isUuid(version.id)) throw new Error("Only a published Recipe can be duplicated.");
  const name = typeof version.name === "string" && version.name.trim() ? `${version.name.trim()} copy` : "Recipe copy";
  const servings = Number(version.servings);
  if (!Number.isFinite(servings) || servings <= 0) throw new Error("Published Recipe has invalid servings.");

  const graph = clonePublishedRecipeGraphForDraft({
    ingredients: (source.ingredients as Array<Record<string, unknown>>).map((item) => ({ ...item, id: String(item.id) })),
    equipment: (source.equipment as Array<Record<string, unknown>>).map((item) => ({ ...item, id: String(item.id) })),
    instructions: (source.instructions as Array<Record<string, unknown>>).map((item) => ({ ...item, id: String(item.id) })),
  }, nextId);

  const ingredients = graph.ingredients.map((item) => ({
    id: item.id,
    position: Number(item.position),
    food_id: typeof item.food_id === "string" && item.food_id ? item.food_id : null,
    ingredient_name: String(item.ingredient_name ?? ""),
    quantity: optionalNumber(item.quantity),
    unit: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
    frozen_nutrition: item.frozen_nutrition && typeof item.frozen_nutrition === "object" ? item.frozen_nutrition : null,
  }));
  const actions = graph.instructions.map((item) => ({
    id: item.id,
    position: Number(item.position),
    instruction: String(item.instruction ?? ""),
    ingredient_refs: Array.isArray(item.ingredient_refs) ? item.ingredient_refs : [],
    equipment_refs: Array.isArray(item.equipment_refs) ? item.equipment_refs : [],
    duration_seconds: optionalNumber(item.duration_seconds),
    heat_or_temperature: typeof item.heat_or_temperature === "string" ? item.heat_or_temperature : null,
    doneness_or_result_cue: typeof item.doneness_or_result_cue === "string" ? item.doneness_or_result_cue : null,
    prep_ahead_cue: typeof item.prep_ahead_cue === "string" ? item.prep_ahead_cue : null,
    track_key: typeof item.track_key === "string" ? item.track_key : null,
    dependency_action_ids: Array.isArray(item.dependency_action_ids) ? item.dependency_action_ids.map(String) : [],
    can_run_in_background: item.can_run_in_background === true,
    metadata: record(item.metadata),
  }));
  const equipment = graph.equipment.map((item) => ({
    id: item.id,
    position: Number(item.position),
    name: String(item.name ?? ""),
    quantity: optionalNumber(item.quantity),
    note: typeof item.note === "string" ? item.note : null,
  }));

  const result = await supabase.rpc("duplicate_nutrition_recipe", {
    p_source_recipe_id: recipeId,
    p_source_version_id: version.id,
    p_name: name,
    p_servings: servings,
    p_total_cooked_weight_g: optionalNumber(version.total_cooked_weight_g),
    p_total_time_minutes: optionalNumber(version.total_time_minutes),
    p_notes: typeof version.notes === "string" ? version.notes : null,
    p_draft_metadata: record(version.metadata),
    p_ingredients: ingredients,
    p_actions: actions,
    p_equipment: equipment,
  });
  if (result.error) throw new Error(`Duplicate Recipe could not be committed atomically. ${result.error.message ?? "Database request failed."}`);
  const data = record(result.data);
  if (typeof data.recipeId !== "string" || !isUuid(data.recipeId) || typeof data.draftId !== "string" || !isUuid(data.draftId)) {
    throw new Error("Duplicate Recipe returned invalid canonical identities.");
  }
  return { recipeId: data.recipeId, draftId: data.draftId };
}
