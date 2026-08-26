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

function rootName(name: string | null | undefined) {
  return name?.trim() || "Untitled Recipe";
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
  userId: string,
  input: RecipeDraftInput = {},
) {
  const root = await supabase
    .from("nutrition_recipes")
    .insert({ user_id: userId, name: rootName(input.name) })
    .select("*")
    .single();
  throwDb(root.error);
  if (!root.data?.id) throw new Error("Recipe root was not created.");

  const draft = await supabase
    .from("nutrition_recipe_drafts")
    .insert({
      recipe_id: root.data.id,
      user_id: userId,
      base_recipe_version_id: null,
      ...draftPatch(input),
    })
    .select("*")
    .single();
  if (draft.error || !draft.data?.id) {
    await supabase
      .from("nutrition_recipes")
      .delete()
      .eq("id", root.data.id)
      .eq("user_id", userId);
    throw new Error(
      draft.error
        ? message(draft.error)
        : "Recipe Working Draft was not created.",
    );
  }
  return {
    recipeId: String(root.data.id),
    draftId: String(draft.data.id),
    recipe: root.data,
    draft: draft.data,
  };
}

async function replaceDraftChildren(
  supabase: SupabaseClient,
  userId: string,
  draftId: string,
  input: RecipeDraftInput,
) {
  const ingredientDelete = await supabase
    .from("nutrition_recipe_ingredients")
    .delete()
    .eq("recipe_draft_id", draftId)
    .eq("user_id", userId);
  throwDb(ingredientDelete.error);
  const actionDelete = await supabase
    .from("nutrition_recipe_actions")
    .delete()
    .eq("recipe_draft_id", draftId)
    .eq("user_id", userId);
  throwDb(actionDelete.error);
  const equipmentDelete = await supabase
    .from("nutrition_recipe_equipment")
    .delete()
    .eq("recipe_draft_id", draftId)
    .eq("user_id", userId);
  throwDb(equipmentDelete.error);

  if (input.ingredients?.length) {
    const inserted = await supabase.from("nutrition_recipe_ingredients").insert(
      input.ingredients.map((item, position) => ({
        user_id: userId,
        recipe_version_id: null,
        recipe_draft_id: draftId,
        position,
        food_id: item.food_id ?? null,
        ingredient_name: item.ingredient_name.trim(),
        quantity: item.quantity ?? null,
        unit: item.unit?.trim() || null,
        frozen_nutrition: item.frozen_nutrition ?? null,
      })),
    );
    throwDb(inserted.error);
  }

  if (input.instructions?.length) {
    const inserted = await supabase.from("nutrition_recipe_actions").insert(
      input.instructions.map((item, position) => ({
        user_id: userId,
        recipe_version_id: null,
        recipe_draft_id: draftId,
        position,
        instruction: item.instruction.trim(),
        ingredient_refs: item.ingredient_refs ?? [],
        equipment_refs: item.equipment_refs ?? [],
        duration_seconds: item.duration_seconds ?? null,
        heat_or_temperature: item.heat_or_temperature?.trim() || null,
        doneness_or_result_cue: item.doneness_or_result_cue?.trim() || null,
        prep_ahead_cue: item.prep_ahead_cue?.trim() || null,
        track_key: item.track_key?.trim() || null,
        dependency_action_ids: item.dependency_action_ids ?? [],
        can_run_in_background: Boolean(item.can_run_in_background),
        metadata: item.metadata ?? {},
      })),
    );
    throwDb(inserted.error);
  }

  if (input.equipment?.length) {
    const inserted = await supabase.from("nutrition_recipe_equipment").insert(
      input.equipment.map((item, position) => ({
        user_id: userId,
        recipe_version_id: null,
        recipe_draft_id: draftId,
        position,
        name: item.name.trim(),
        quantity: item.quantity ?? null,
        note: item.note?.trim() || null,
      })),
    );
    throwDb(inserted.error);
  }
}

export async function autosaveRecipeDraft(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
  input: RecipeDraftInput,
) {
  const draft = await supabase
    .from("nutrition_recipe_drafts")
    .update(draftPatch(input))
    .eq("recipe_id", recipeId)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwDb(draft.error);
  if (!draft.data?.id) throw new Error("Recipe Working Draft was not found.");
  await replaceDraftChildren(supabase, userId, String(draft.data.id), input);
  return draft.data;
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
  const returnedRecipeId =
    typeof data?.recipeId === "string" ? data.recipeId : null;
  const recipeVersionId =
    typeof data?.recipeVersionId === "string" ? data.recipeVersionId : null;
  const versionNumber =
    typeof data?.versionNumber === "number" ? data.versionNumber : null;
  const version =
    data?.version && typeof data.version === "object"
      ? (data.version as Record<string, unknown>)
      : null;

  if (
    returnedRecipeId !== recipeId ||
    !recipeVersionId ||
    !Number.isInteger(versionNumber) ||
    !version ||
    version.id !== recipeVersionId
  ) {
    throw new Error("Recipe publication command returned an invalid result.");
  }

  return {
    recipeId: returnedRecipeId,
    recipeVersionId,
    versionNumber,
    version,
  };
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
