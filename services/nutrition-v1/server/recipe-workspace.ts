import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeNutritionPerServing } from "@/lib/nutrition-v1/recipe-cache";

type JsonRecord = Record<string, unknown>;

type RecipeRootRow = {
  id: string;
  user_id: string;
  name: string;
  is_favorite: boolean;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  purge_after: string | null;
};

type RecipeDraftRow = {
  id: string;
  recipe_id: string;
  user_id: string;
  base_recipe_version_id: string | null;
  name: string | null;
  servings: number | null;
  total_cooked_weight_g: number | null;
  total_time_minutes: number | null;
  notes: string | null;
  draft_metadata: JsonRecord;
  created_at: string;
  updated_at: string;
};

type RecipeVersionRow = {
  id: string;
  recipe_id: string;
  user_id: string;
  version_number: number;
  name: string;
  servings: number;
  total_cooked_weight_g: number | null;
  total_time_minutes: number | null;
  notes: string | null;
  metadata: JsonRecord;
  published_at: string;
  created_at: string;
};

export type RecipeWorkspaceIngredient = {
  id: string;
  position: number;
  food_id: string | null;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  frozen_nutrition: JsonRecord | null;
  verified: boolean;
};

export type RecipeWorkspaceInstruction = {
  id: string;
  position: number;
  instruction: string;
  ingredient_refs: unknown[];
  equipment_refs: unknown[];
  duration_seconds: number | null;
  heat_or_temperature: string | null;
  doneness_or_result_cue: string | null;
  prep_ahead_cue: string | null;
  track_key: string | null;
  dependency_action_ids: string[];
  can_run_in_background: boolean;
  metadata: JsonRecord;
};

export type RecipeWorkspaceEquipment = {
  id: string;
  position: number;
  name: string;
  quantity: number | null;
  note: string | null;
};

export type RecipeHomeRecord = {
  recipeId: string;
  name: string;
  favorite: boolean;
  coverPath: string | null;
  updatedAt: string;
  lastUsedAt: string | null;
  status: "draft" | "published";
  draftId: string | null;
  draftUpdatedAt: string | null;
  recipeVersionId: string | null;
  versionNumber: number | null;
  servings: number | null;
  totalTimeMinutes: number | null;
  cuisine: string | null;
  nutritionPerServing: RecipeNutritionPerServing | null;
};

export type RecipeWorkspace = {
  root: RecipeRootRow;
  draft: RecipeDraftRow | null;
  latestVersion: RecipeVersionRow | null;
  status: "draft" | "published";
  ingredients: RecipeWorkspaceIngredient[];
  instructions: RecipeWorkspaceInstruction[];
  equipment: RecipeWorkspaceEquipment[];
  cuisine: string | null;
  nutritionPerServing: RecipeNutritionPerServing | null;
};

function dbError(error: unknown) {
  if (!error) return;
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message) : "Recipe workspace request failed.";
  throw new Error(message);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nullableNutrition(value: unknown): RecipeNutritionPerServing | null {
  const source = asRecord(value);
  const keys = ["calories", "protein_g", "carbs_g", "fat_g"] as const;
  const result = {} as RecipeNutritionPerServing;
  let known = false;
  for (const key of keys) {
    const raw = source[key];
    if (raw === null || raw === undefined) result[key] = null;
    else if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      result[key] = raw;
      known = true;
    } else return null;
  }
  return known ? result : null;
}

function metadataNutrition(metadata: unknown) {
  const record = asRecord(metadata);
  return nullableNutrition(record.nutrition_per_serving ?? record.nutritionPerServing);
}

function metadataCuisine(metadata: unknown) {
  const record = asRecord(metadata);
  return typeof record.cuisine === "string" && record.cuisine.trim() ? record.cuisine.trim() : null;
}

function boundLimit(value: number | undefined, max = 40) {
  const finite = Number.isFinite(value) ? Math.trunc(value as number) : 24;
  return Math.max(1, Math.min(max, finite));
}

function latestVersions(rows: RecipeVersionRow[]) {
  const byRecipe = new Map<string, RecipeVersionRow>();
  for (const row of rows) {
    const current = byRecipe.get(row.recipe_id);
    if (!current || row.version_number > current.version_number) byRecipe.set(row.recipe_id, row);
  }
  return byRecipe;
}

export async function listRecipeHome(
  supabase: SupabaseClient,
  userId: string,
  input: { query?: string; limit?: number } = {},
): Promise<RecipeHomeRecord[]> {
  const limit = boundLimit(input.limit);
  const search = input.query?.trim().replace(/[%_]/g, "") ?? "";
  let rootQuery = supabase
    .from("nutrition_recipes")
    .select("id,user_id,name,is_favorite,cover_path,created_at,updated_at,deleted_at,purge_after")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (search) rootQuery = rootQuery.ilike("name", `%${search}%`);
  const rootsResult = await rootQuery;
  dbError(rootsResult.error);
  const roots = (rootsResult.data ?? []) as RecipeRootRow[];
  if (!roots.length) return [];
  const ids = roots.map((row) => row.id);

  const [draftsResult, versionsResult, usageResult] = await Promise.all([
    supabase.from("nutrition_recipe_drafts").select("*").eq("user_id", userId).in("recipe_id", ids).limit(limit),
    supabase.from("nutrition_recipe_versions").select("*").eq("user_id", userId).in("recipe_id", ids).order("version_number", { ascending: false }).limit(limit * 12),
    supabase.from("nutrition_log_groups").select("source_id,created_at").eq("user_id", userId).eq("source_type", "recipe").in("source_id", ids).order("created_at", { ascending: false }).limit(Math.min(80, limit * 4)),
  ]);
  dbError(draftsResult.error);
  dbError(versionsResult.error);
  dbError(usageResult.error);

  const drafts = new Map(((draftsResult.data ?? []) as RecipeDraftRow[]).map((row) => [row.recipe_id, row]));
  const versions = latestVersions((versionsResult.data ?? []) as RecipeVersionRow[]);
  const lastUsed = new Map<string, string>();
  for (const row of (usageResult.data ?? []) as Array<{ source_id: string | null; created_at: string }>) {
    if (row.source_id && !lastUsed.has(row.source_id)) lastUsed.set(row.source_id, row.created_at);
  }

  return roots.map((root) => {
    const draft = drafts.get(root.id) ?? null;
    const version = versions.get(root.id) ?? null;
    const displayMetadata = draft?.draft_metadata ?? version?.metadata ?? {};
    return {
      recipeId: root.id,
      name: draft?.name?.trim() || version?.name || root.name,
      favorite: root.is_favorite,
      coverPath: root.cover_path,
      updatedAt: root.updated_at,
      lastUsedAt: lastUsed.get(root.id) ?? null,
      status: draft ? "draft" : "published",
      draftId: draft?.id ?? null,
      draftUpdatedAt: draft?.updated_at ?? null,
      recipeVersionId: version?.id ?? null,
      versionNumber: version?.version_number ?? null,
      servings: draft?.servings ?? version?.servings ?? null,
      totalTimeMinutes: draft?.total_time_minutes ?? version?.total_time_minutes ?? null,
      cuisine: metadataCuisine(displayMetadata),
      nutritionPerServing: metadataNutrition(displayMetadata),
    };
  });
}

export async function listRecentlyDeletedRecipes(supabase: SupabaseClient, userId: string, limit = 20) {
  const result = await supabase
    .from("nutrition_recipes")
    .select("id,name,cover_path,deleted_at,purge_after")
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .order("purge_after", { ascending: true })
    .limit(boundLimit(limit, 40));
  dbError(result.error);
  return (result.data ?? []) as Array<{ id: string; name: string; cover_path: string | null; deleted_at: string; purge_after: string }>;
}

async function componentRows(supabase: SupabaseClient, userId: string, draftId: string | null, versionId: string | null) {
  const relation = draftId ? { column: "recipe_draft_id", id: draftId } : versionId ? { column: "recipe_version_id", id: versionId } : null;
  if (!relation) return { ingredients: [], instructions: [], equipment: [] };
  const [ingredientsResult, instructionsResult, equipmentResult] = await Promise.all([
    supabase.from("nutrition_recipe_ingredients").select("*").eq("user_id", userId).eq(relation.column, relation.id).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_actions").select("*").eq("user_id", userId).eq(relation.column, relation.id).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_equipment").select("*").eq("user_id", userId).eq(relation.column, relation.id).order("position", { ascending: true }),
  ]);
  dbError(ingredientsResult.error);
  dbError(instructionsResult.error);
  dbError(equipmentResult.error);

  const ingredientRows = (ingredientsResult.data ?? []) as Array<Record<string, unknown>>;
  const foodIds = Array.from(new Set(ingredientRows.map((row) => typeof row.food_id === "string" ? row.food_id : null).filter((id): id is string => Boolean(id))));
  const verified = new Map<string, boolean>();
  if (foodIds.length) {
    const foodsResult = await supabase.from("food_items").select("id,is_verified").in("id", foodIds);
    dbError(foodsResult.error);
    for (const row of (foodsResult.data ?? []) as Array<{ id: string; is_verified: boolean }>) verified.set(row.id, row.is_verified === true);
  }

  return {
    ingredients: ingredientRows.map((row) => ({
      id: String(row.id),
      position: Number(row.position),
      food_id: typeof row.food_id === "string" ? row.food_id : null,
      ingredient_name: String(row.ingredient_name),
      quantity: typeof row.quantity === "number" ? row.quantity : row.quantity === null ? null : Number(row.quantity),
      unit: typeof row.unit === "string" ? row.unit : null,
      frozen_nutrition: row.frozen_nutrition && typeof row.frozen_nutrition === "object" ? row.frozen_nutrition as JsonRecord : null,
      verified: typeof row.food_id === "string" ? verified.get(row.food_id) === true : false,
    })),
    instructions: ((instructionsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      position: Number(row.position),
      instruction: String(row.instruction),
      ingredient_refs: Array.isArray(row.ingredient_refs) ? row.ingredient_refs : [],
      equipment_refs: Array.isArray(row.equipment_refs) ? row.equipment_refs : [],
      duration_seconds: typeof row.duration_seconds === "number" ? row.duration_seconds : row.duration_seconds === null ? null : Number(row.duration_seconds),
      heat_or_temperature: typeof row.heat_or_temperature === "string" ? row.heat_or_temperature : null,
      doneness_or_result_cue: typeof row.doneness_or_result_cue === "string" ? row.doneness_or_result_cue : null,
      prep_ahead_cue: typeof row.prep_ahead_cue === "string" ? row.prep_ahead_cue : null,
      track_key: typeof row.track_key === "string" ? row.track_key : null,
      dependency_action_ids: Array.isArray(row.dependency_action_ids) ? row.dependency_action_ids.map(String) : [],
      can_run_in_background: row.can_run_in_background === true,
      metadata: asRecord(row.metadata),
    })),
    equipment: ((equipmentResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      position: Number(row.position),
      name: String(row.name),
      quantity: typeof row.quantity === "number" ? row.quantity : row.quantity === null ? null : Number(row.quantity),
      note: typeof row.note === "string" ? row.note : null,
    })),
  };
}

export async function getRecipeWorkspace(supabase: SupabaseClient, userId: string, recipeId: string, includeDeleted = false): Promise<RecipeWorkspace> {
  let rootQuery = supabase.from("nutrition_recipes").select("*").eq("id", recipeId).eq("user_id", userId);
  if (!includeDeleted) rootQuery = rootQuery.is("deleted_at", null);
  const rootResult = await rootQuery.maybeSingle();
  dbError(rootResult.error);
  if (!rootResult.data) throw new Error("Recipe not found.");
  const root = rootResult.data as RecipeRootRow;

  const [draftResult, versionResult] = await Promise.all([
    supabase.from("nutrition_recipe_drafts").select("*").eq("recipe_id", recipeId).eq("user_id", userId).maybeSingle(),
    supabase.from("nutrition_recipe_versions").select("*").eq("recipe_id", recipeId).eq("user_id", userId).order("version_number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  dbError(draftResult.error);
  dbError(versionResult.error);
  const draft = (draftResult.data as RecipeDraftRow | null) ?? null;
  const latestVersion = (versionResult.data as RecipeVersionRow | null) ?? null;
  const components = await componentRows(supabase, userId, draft?.id ?? null, draft ? null : latestVersion?.id ?? null);
  const metadata = draft?.draft_metadata ?? latestVersion?.metadata ?? {};
  return {
    root,
    draft,
    latestVersion,
    status: draft ? "draft" : "published",
    ...components,
    cuisine: metadataCuisine(metadata),
    nutritionPerServing: metadataNutrition(metadata),
  };
}

export async function ensureRecipeWorkingDraft(supabase: SupabaseClient, userId: string, recipeId: string) {
  const current = await getRecipeWorkspace(supabase, userId, recipeId);
  if (current.draft) return current;
  const version = current.latestVersion;
  if (!version) throw new Error("Published Recipe version not found.");
  const publishedComponents = await componentRows(supabase, userId, null, version.id);
  const draftInsert = await supabase.from("nutrition_recipe_drafts").insert({
    recipe_id: recipeId,
    user_id: userId,
    base_recipe_version_id: version.id,
    name: version.name,
    servings: version.servings,
    total_cooked_weight_g: version.total_cooked_weight_g,
    total_time_minutes: version.total_time_minutes,
    notes: version.notes,
    draft_metadata: version.metadata ?? {},
  }).select("*").single();
  dbError(draftInsert.error);
  const draftId = String(draftInsert.data.id);
  try {
    if (publishedComponents.ingredients.length) {
      const result = await supabase.from("nutrition_recipe_ingredients").insert(publishedComponents.ingredients.map((item) => ({
        user_id: userId, recipe_version_id: null, recipe_draft_id: draftId, position: item.position, food_id: item.food_id,
        ingredient_name: item.ingredient_name, quantity: item.quantity, unit: item.unit, frozen_nutrition: item.frozen_nutrition,
      })));
      dbError(result.error);
    }
    if (publishedComponents.instructions.length) {
      const result = await supabase.from("nutrition_recipe_actions").insert(publishedComponents.instructions.map((item) => ({
        user_id: userId, recipe_version_id: null, recipe_draft_id: draftId, position: item.position, instruction: item.instruction,
        ingredient_refs: item.ingredient_refs, equipment_refs: item.equipment_refs, duration_seconds: item.duration_seconds,
        heat_or_temperature: item.heat_or_temperature, doneness_or_result_cue: item.doneness_or_result_cue,
        prep_ahead_cue: item.prep_ahead_cue, track_key: item.track_key, dependency_action_ids: item.dependency_action_ids,
        can_run_in_background: item.can_run_in_background, metadata: item.metadata,
      })));
      dbError(result.error);
    }
    if (publishedComponents.equipment.length) {
      const result = await supabase.from("nutrition_recipe_equipment").insert(publishedComponents.equipment.map((item) => ({
        user_id: userId, recipe_version_id: null, recipe_draft_id: draftId, position: item.position, name: item.name,
        quantity: item.quantity, note: item.note,
      })));
      dbError(result.error);
    }
  } catch (error) {
    await supabase.from("nutrition_recipe_drafts").delete().eq("id", draftId).eq("user_id", userId);
    throw error;
  }
  return getRecipeWorkspace(supabase, userId, recipeId);
}

export async function updateRecipePresentation(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
  patch: { favorite?: boolean; coverPath?: string | null },
) {
  const update: Record<string, unknown> = {};
  if (typeof patch.favorite === "boolean") update.is_favorite = patch.favorite;
  if (patch.coverPath === null || typeof patch.coverPath === "string") update.cover_path = patch.coverPath?.trim() || null;
  if (!Object.keys(update).length) return getRecipeWorkspace(supabase, userId, recipeId);
  const result = await supabase.from("nutrition_recipes").update(update).eq("id", recipeId).eq("user_id", userId).is("deleted_at", null).select("id").single();
  dbError(result.error);
  return getRecipeWorkspace(supabase, userId, recipeId);
}

export async function duplicatePublishedRecipe(supabase: SupabaseClient, userId: string, recipeId: string) {
  const source = await getRecipeWorkspace(supabase, userId, recipeId);
  if (!source.latestVersion) throw new Error("Only a published Recipe can be duplicated.");
  const version = source.latestVersion;
  const rootInsert = await supabase.from("nutrition_recipes").insert({ user_id: userId, name: `${version.name} copy`, is_favorite: false }).select("*").single();
  dbError(rootInsert.error);
  const newRecipeId = String(rootInsert.data.id);
  const draftInsert = await supabase.from("nutrition_recipe_drafts").insert({
    recipe_id: newRecipeId, user_id: userId, base_recipe_version_id: null, name: `${version.name} copy`, servings: version.servings,
    total_cooked_weight_g: version.total_cooked_weight_g, total_time_minutes: version.total_time_minutes, notes: version.notes,
    draft_metadata: version.metadata ?? {},
  }).select("id").single();
  if (draftInsert.error || !draftInsert.data?.id) {
    await supabase.from("nutrition_recipes").delete().eq("id", newRecipeId).eq("user_id", userId);
    dbError(draftInsert.error ?? new Error("Duplicate Recipe draft could not be created."));
  }
  const draftId = String(draftInsert.data.id);
  const sourceComponents = await componentRows(supabase, userId, null, version.id);
  try {
    if (sourceComponents.ingredients.length) dbError((await supabase.from("nutrition_recipe_ingredients").insert(sourceComponents.ingredients.map((item) => ({ user_id: userId, recipe_version_id: null, recipe_draft_id: draftId, position: item.position, food_id: item.food_id, ingredient_name: item.ingredient_name, quantity: item.quantity, unit: item.unit, frozen_nutrition: item.frozen_nutrition })))).error);
    if (sourceComponents.instructions.length) dbError((await supabase.from("nutrition_recipe_actions").insert(sourceComponents.instructions.map((item) => ({ user_id: userId, recipe_version_id: null, recipe_draft_id: draftId, position: item.position, instruction: item.instruction, ingredient_refs: item.ingredient_refs, equipment_refs: item.equipment_refs, duration_seconds: item.duration_seconds, heat_or_temperature: item.heat_or_temperature, doneness_or_result_cue: item.doneness_or_result_cue, prep_ahead_cue: item.prep_ahead_cue, track_key: item.track_key, dependency_action_ids: item.dependency_action_ids, can_run_in_background: item.can_run_in_background, metadata: item.metadata })))).error);
    if (sourceComponents.equipment.length) dbError((await supabase.from("nutrition_recipe_equipment").insert(sourceComponents.equipment.map((item) => ({ user_id: userId, recipe_version_id: null, recipe_draft_id: draftId, position: item.position, name: item.name, quantity: item.quantity, note: item.note })))).error);
  } catch (error) {
    await supabase.from("nutrition_recipe_drafts").delete().eq("id", draftId).eq("user_id", userId);
    await supabase.from("nutrition_recipes").delete().eq("id", newRecipeId).eq("user_id", userId);
    throw error;
  }
  return { recipeId: newRecipeId, draftId };
}
