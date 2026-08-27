import type { SupabaseClient } from "@supabase/supabase-js";

type RecipeIngredientInput = {
  food_id?: string | null;
  ingredient_name: string;
  quantity?: number | null;
  unit?: string | null;
  frozen_nutrition?: Record<string, unknown> | null;
};

type RecipeInstructionInput = {
  instruction: string;
  ingredient_refs?: unknown[];
  equipment_refs?: unknown[];
  duration_seconds?: number | null;
  heat_or_temperature?: string | null;
  doneness_or_result_cue?: string | null;
  prep_ahead_cue?: string | null;
  track_key?: string | null;
  dependency_action_ids?: string[];
  can_run_in_background?: boolean;
  metadata?: Record<string, unknown>;
};

type RecipeEquipmentInput = {
  name: string;
  quantity?: number | null;
  note?: string | null;
};

export type RecipeDraftInput = {
  name?: string | null;
  servings?: number | null;
  total_cooked_weight_g?: number | null;
  total_time_minutes?: number | null;
  notes?: string | null;
  ingredients?: RecipeIngredientInput[];
  instructions?: RecipeInstructionInput[];
  equipment?: RecipeEquipmentInput[];
  draft_metadata?: Record<string, unknown>;
};

function message(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : "Nutrition Recipe operation failed.";
}

function throwDb(error: unknown) {
  if (error) throw new Error(message(error));
}

function draftPatch(input: RecipeDraftInput) {
  return {
    name: input.name?.trim() || null,
    servings: input.servings ?? null,
    total_cooked_weight_g: input.total_cooked_weight_g ?? null,
    total_time_minutes: input.total_time_minutes ?? null,
    notes: input.notes?.trim() || null,
    draft_metadata: input.draft_metadata ?? {},
  };
}

export async function createRecipeDraft(
  supabase: SupabaseClient,
  _userId: string,
  input: RecipeDraftInput = {},
) {
  const result = await supabase.rpc("create_nutrition_recipe_draft", {
    p_name: input.name?.trim() || null,
    p_servings: input.servings ?? null,
    p_total_cooked_weight_g: input.total_cooked_weight_g ?? null,
    p_total_time_minutes: input.total_time_minutes ?? null,
    p_notes: input.notes?.trim() || null,
    p_draft_metadata: input.draft_metadata ?? {},
  });
  throwDb(result.error);
  const data = result.data as Record<string, unknown> | null;
  const recipeId = typeof data?.recipeId === "string" ? data.recipeId : null;
  const draftId = typeof data?.draftId === "string" ? data.draftId : null;
  const recipe = data?.recipe && typeof data.recipe === "object" ? data.recipe as Record<string, unknown> : null;
  const draft = data?.draft && typeof data.draft === "object" ? data.draft as Record<string, unknown> : null;
  if (!recipeId || !draftId || !recipe || !draft || recipe.id !== recipeId || draft.id !== draftId || draft.recipe_id !== recipeId) {
    throw new Error("Atomic Recipe Working Draft creation returned an invalid result.");
  }
  return { recipeId, draftId, recipe, draft };
}

export async function autosaveRecipeDraft(
  supabase: SupabaseClient,
  _userId: string,
  recipeId: string,
  input: RecipeDraftInput,
) {
  const result = await supabase.rpc("autosave_nutrition_recipe_draft", {
    p_recipe_id: recipeId,
    p_draft: draftPatch(input),
    p_ingredients: input.ingredients ?? [],
    p_instructions: input.instructions ?? [],
    p_equipment: input.equipment ?? [],
  });
  throwDb(result.error);
  const draft = result.data as Record<string, unknown> | null;
  if (!draft?.id || draft.recipe_id !== recipeId) {
    throw new Error("Recipe Working Draft autosave returned an invalid result.");
  }
  return draft;
}

export async function publishRecipeDraft(
  supabase: SupabaseClient,
  _userId: string,
  recipeId: string,
) {
  const result = await supabase.rpc("publish_nutrition_recipe_draft", {
    p_recipe_id: recipeId,
  });
  throwDb(result.error);

  const data = result.data as Record<string, unknown> | null;
  const returnedRecipeId = typeof data?.recipeId === "string" ? data.recipeId : null;
  const recipeVersionId = typeof data?.recipeVersionId === "string" ? data.recipeVersionId : null;
  const versionNumber = typeof data?.versionNumber === "number" ? data.versionNumber : null;
  const version = data?.version && typeof data.version === "object"
    ? data.version as Record<string, unknown>
    : null;

  if (
    returnedRecipeId !== recipeId
    || !recipeVersionId
    || !Number.isInteger(versionNumber)
    || !version
    || version.id !== recipeVersionId
  ) {
    throw new Error("Recipe publication command returned an invalid result.");
  }

  return { recipeId: returnedRecipeId, recipeVersionId, versionNumber, version };
}

export async function discardRecipeDraft(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
) {
  const result = await supabase
    .from("nutrition_recipe_drafts")
    .delete()
    .eq("recipe_id", recipeId)
    .eq("user_id", userId);
  throwDb(result.error);
}

async function lifecycleRpc(
  supabase: SupabaseClient,
  name: string,
  recipeId: string,
) {
  const result = await supabase.rpc(name, { p_recipe_id: recipeId });
  throwDb(result.error);
  const data = result.data as Record<string, unknown> | null;
  const id = typeof data?.id === "string" ? data.id : null;
  if (!id) throw new Error("Recipe lifecycle command returned an invalid result.");
  return { ...data, id };
}

export function softDeleteRecipe(supabase: SupabaseClient, recipeId: string) {
  return lifecycleRpc(supabase, "soft_delete_nutrition_recipe", recipeId);
}

export function restoreRecipe(supabase: SupabaseClient, recipeId: string) {
  return lifecycleRpc(supabase, "restore_nutrition_recipe", recipeId);
}

export function purgeRecipeNow(supabase: SupabaseClient, recipeId: string) {
  return lifecycleRpc(supabase, "purge_nutrition_recipe_now", recipeId);
}
