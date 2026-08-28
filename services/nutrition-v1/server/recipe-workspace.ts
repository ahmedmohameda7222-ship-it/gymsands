import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeNutritionPerServing } from "@/lib/nutrition-v1/recipe-cache";
import { clonePublishedRecipeGraphForDraft } from "@/lib/nutrition-v1/recipe-versioning";

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
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : "Recipe workspace request failed.";
  throw new Error(message);
}

function requiredData<T>(data: T | null, error: unknown, fallback: string): T {
  dbError(error);
  if (data === null) throw new Error(fallback);
  return data;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nullableNutrition(value: unknown): RecipeNutritionPerServing | null {
  const source = asRecord(value);
  const result: RecipeNutritionPerServing = { calories: null, protein_g: null, carbs_g: null, fat_g: null };
  let known = false;
  for (const key of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
    const raw = source[key];
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
    result[key] = raw;
    known = true;
  }
  return known ? result : null;
}

function metadataNutrition(metadata: unknown) {
  const value = asRecord(metadata);
  return nullableNutrition(value.nutrition_per_serving ?? value.nutritionPerServing);
}

function metadataCuisine(metadata: unknown) {
  const value = asRecord(metadata);
  return typeof value.cuisine === "string" && value.cuisine.trim() ? value.cuisine.trim() : null;
}

function boundLimit(value: number | undefined, max = 40) {
  const candidate = Number.isFinite(value) ? Math.trunc(value as number) : 24;
  return Math.max(1, Math.min(max, candidate));
}

function latestVersions(rows: RecipeVersionRow[]) {
  const result = new Map<string, RecipeVersionRow>();
  for (const row of rows) {
    const current = result.get(row.recipe_id);
    if (!current || row.version_number > current.version_number) result.set(row.recipe_id, row);
  }
  return result;
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
    const metadata = draft?.draft_metadata ?? version?.metadata ?? {};
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
      cuisine: metadataCuisine(metadata),
      nutritionPerServing: metadataNutrition(metadata),
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
  const relation = draftId
    ? { column: "recipe_draft_id", id: draftId }
    : versionId
      ? { column: "recipe_version_id", id: versionId }
      : null;
  if (!relation) return { ingredients: [] as RecipeWorkspaceIngredient[], instructions: [] as RecipeWorkspaceInstruction[], equipment: [] as RecipeWorkspaceEquipment[] };

  const [ingredientsResult, actionsResult, equipmentResult] = await Promise.all([
    supabase.from("nutrition_recipe_ingredients").select("*").eq("user_id", userId).eq(relation.column, relation.id).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_actions").select("*").eq("user_id", userId).eq(relation.column, relation.id).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_equipment").select("*").eq("user_id", userId).eq(relation.column, relation.id).order("position", { ascending: true }),
  ]);
  dbError(ingredientsResult.error);
  dbError(actionsResult.error);
  dbError(equipmentResult.error);

  const rawIngredients = (ingredientsResult.data ?? []) as Array<Record<string, unknown>>;
  const foodIds = Array.from(new Set(rawIngredients.map((row) => typeof row.food_id === "string" ? row.food_id : null).filter((id): id is string => Boolean(id))));
  const verifiedFoods = new Map<string, boolean>();
  if (foodIds.length) {
    const foodsResult = await supabase.from("food_items").select("id,is_verified").in("id", foodIds);
    dbError(foodsResult.error);
    for (const row of (foodsResult.data ?? []) as Array<{ id: string; is_verified: boolean }>) verifiedFoods.set(row.id, row.is_verified === true);
  }

  const ingredients: RecipeWorkspaceIngredient[] = rawIngredients.map((row) => ({
    id: String(row.id),
    position: Number(row.position),
    food_id: typeof row.food_id === "string" ? row.food_id : null,
    ingredient_name: String(row.ingredient_name),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    unit: typeof row.unit === "string" ? row.unit : null,
    frozen_nutrition: row.frozen_nutrition && typeof row.frozen_nutrition === "object" ? row.frozen_nutrition as JsonRecord : null,
    verified: typeof row.food_id === "string" && verifiedFoods.get(row.food_id) === true,
  }));

  const instructions: RecipeWorkspaceInstruction[] = ((actionsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    position: Number(row.position),
    instruction: String(row.instruction),
    ingredient_refs: Array.isArray(row.ingredient_refs) ? row.ingredient_refs : [],
    equipment_refs: Array.isArray(row.equipment_refs) ? row.equipment_refs : [],
    duration_seconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    heat_or_temperature: typeof row.heat_or_temperature === "string" ? row.heat_or_temperature : null,
    doneness_or_result_cue: typeof row.doneness_or_result_cue === "string" ? row.doneness_or_result_cue : null,
    prep_ahead_cue: typeof row.prep_ahead_cue === "string" ? row.prep_ahead_cue : null,
    track_key: typeof row.track_key === "string" ? row.track_key : null,
    dependency_action_ids: Array.isArray(row.dependency_action_ids) ? row.dependency_action_ids.map(String) : [],
    can_run_in_background: row.can_run_in_background === true,
    metadata: asRecord(row.metadata),
  }));

  const equipment: RecipeWorkspaceEquipment[] = ((equipmentResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    position: Number(row.position),
    name: String(row.name),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    note: typeof row.note === "string" ? row.note : null,
  }));

  return { ingredients, instructions, equipment };
}

export async function getRecipeWorkspace(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
  includeDeleted = false,
): Promise<RecipeWorkspace> {
  let rootQuery = supabase.from("nutrition_recipes").select("*").eq("id", recipeId).eq("user_id", userId);
  if (!includeDeleted) rootQuery = rootQuery.is("deleted_at", null);
  const rootResult = await rootQuery.maybeSingle();
  const root = requiredData(rootResult.data as RecipeRootRow | null, rootResult.error, "Recipe not found.");

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
  const draftGraph = clonePublishedRecipeGraphForDraft(publishedComponents, () => crypto.randomUUID());
  const result = await supabase.rpc("create_nutrition_recipe_working_draft", {
    p_recipe_id: recipeId,
    p_base_recipe_version_id: version.id,
    p_ingredients: draftGraph.ingredients,
    p_actions: draftGraph.instructions,
    p_equipment: draftGraph.equipment,
  });
  dbError(result.error);
  const data = result.data as Record<string, unknown> | null;
  if (data?.recipeId !== recipeId || typeof data?.draftId !== "string") {
    throw new Error("Atomic Recipe Working Draft creation returned an invalid result.");
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
  requiredData(result.data, result.error, "Recipe presentation could not be updated.");
  return getRecipeWorkspace(supabase, userId, recipeId);
}
