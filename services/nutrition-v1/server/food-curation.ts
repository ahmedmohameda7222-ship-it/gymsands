import type { SupabaseClient } from "@supabase/supabase-js";

export type FoodCatalogActor = {
  role?: string | null;
};

export type FoodCatalogProvenance = {
  id: string;
  food_id: string;
  provider: string;
  source_record_id: string;
  source_dataset: string | null;
  source_version: string | null;
  source_release_date: string | null;
  source_record_checksum_sha256: string | null;
  source_reference: string | null;
  license_name: string;
  license_reference: string | null;
  retrieved_at: string | null;
  ingestion_batch_ids: string[];
};

export type FoodCatalogCandidateReview = {
  id: string;
  food_name: string;
  brand_name: string | null;
  serving_size: string | null;
  category: string | null;
  cuisine: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  lifecycle_status: "draft" | "active" | "deprecated" | "withdrawn" | "merged";
  is_verified: boolean;
  verified_at: string | null;
  verified_source_record_id: string | null;
  merged_into_food_id: string | null;
  provenance: FoodCatalogProvenance[];
};

export type FoodNormalizationInput = {
  foodId: string;
  food_name?: string;
  serving_size?: string | null;
  category?: string | null;
  cuisine?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

export type FoodCatalogCommand =
  | { kind: "list" }
  | { kind: "normalize"; input: FoodNormalizationInput }
  | { kind: "publish"; foodId: string }
  | { kind: "verify"; foodId: string; sourceRecordId: string }
  | { kind: "unverify"; foodId: string }
  | { kind: "merge"; sourceFoodId: string; targetFoodId: string }
  | { kind: "deprecate"; foodId: string }
  | { kind: "restore"; foodId: string };

export type FoodCatalogSnapshot = {
  candidates: FoodCatalogCandidateReview[];
};

type DbError = { message?: string } | null;
type DbResult<T> = { data: T | null; error: DbError };

function errorMessage(error: DbError) {
  return error?.message?.trim() || "database error";
}

function requiredData<T>(result: DbResult<T>, label: string): T {
  if (result.error) throw new Error(`${label}: ${errorMessage(result.error)}`);
  if (result.data === null || result.data === undefined) throw new Error(`${label}: record not found`);
  return result.data;
}

function optionalData<T>(result: DbResult<T>, label: string): T | null {
  if (result.error) throw new Error(`${label}: ${errorMessage(result.error)}`);
  return result.data ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lifecycle(value: unknown): FoodCatalogCandidateReview["lifecycle_status"] {
  return value === "draft" || value === "deprecated" || value === "withdrawn" || value === "merged"
    ? value
    : "active";
}

export function assertFoodCatalogOwner(actor: FoodCatalogActor) {
  if (actor.role !== "admin") {
    throw new Error("Food Catalog owner/admin authority is required.");
  }
}

export async function listFoodCatalogCandidates(
  supabase: SupabaseClient,
  actor: FoodCatalogActor,
  options: { limit?: number } = {},
): Promise<FoodCatalogSnapshot> {
  assertFoodCatalogOwner(actor);
  const requested = Number(options.limit ?? 40);
  const limit = Math.max(1, Math.min(50, Number.isFinite(requested) ? Math.floor(requested) : 40));
  const foodResult = await supabase
    .from("food_items")
    .select("id,food_name,brand_name,serving_size,category,cuisine,calories,protein_g,carbs_g,fat_g,lifecycle_status,is_verified,verified_at,verified_source_record_id,merged_into_food_id")
    .eq("is_global", true)
    .order("food_name", { ascending: true })
    .limit(limit);
  const foods = requiredData(foodResult as unknown as DbResult<Array<Record<string, unknown>>>, "Food Catalog candidate read");
  const ids = foods.map((row) => asText(row.id)).filter((id): id is string => Boolean(id));

  let provenanceRows: Array<Record<string, unknown>> = [];
  if (ids.length) {
    const provenanceResult = await supabase
      .from("food_source_records")
      .select("id,food_id,provider,source_record_id,source_dataset,source_version,source_release_date,source_record_checksum_sha256,source_reference,license_name,license_reference,retrieved_at")
      .in("food_id", ids)
      .order("retrieved_at", { ascending: false })
      .limit(Math.min(200, limit * 4));
    provenanceRows = requiredData(
      provenanceResult as unknown as DbResult<Array<Record<string, unknown>>>,
      "Food Catalog provenance read",
    );
  }

  const sourceRecordIds = provenanceRows
    .map((row) => asText(row.id))
    .filter((id): id is string => Boolean(id));
  const batchIdsBySourceRecord = new Map<string, string[]>();
  if (sourceRecordIds.length) {
    const participationResult = await supabase
      .from("food_ingestion_batch_records")
      .select("source_record_id,batch_id")
      .in("source_record_id", sourceRecordIds)
      .limit(Math.min(500, Math.max(1, sourceRecordIds.length * 4)));
    const participationRows = requiredData(
      participationResult as unknown as DbResult<Array<Record<string, unknown>>>,
      "Food Catalog ingestion participation read",
    );
    for (const raw of participationRows) {
      const row = asRecord(raw);
      const sourceRecordId = asText(row.source_record_id);
      const batchId = asText(row.batch_id);
      if (!sourceRecordId || !batchId) continue;
      const next = new Set(batchIdsBySourceRecord.get(sourceRecordId) ?? []);
      next.add(batchId);
      batchIdsBySourceRecord.set(sourceRecordId, [...next].sort());
    }
  }

  const provenanceByFood = new Map<string, FoodCatalogProvenance[]>();
  for (const raw of provenanceRows) {
    const row = asRecord(raw);
    const foodId = asText(row.food_id);
    const id = asText(row.id);
    const provider = asText(row.provider);
    const sourceRecordId = asText(row.source_record_id);
    const licenseName = asText(row.license_name);
    if (!foodId || !id || !provider || !sourceRecordId || !licenseName) continue;
    const item: FoodCatalogProvenance = {
      id,
      food_id: foodId,
      provider,
      source_record_id: sourceRecordId,
      source_dataset: asText(row.source_dataset),
      source_version: asText(row.source_version),
      source_release_date: asText(row.source_release_date),
      source_record_checksum_sha256: asText(row.source_record_checksum_sha256),
      source_reference: asText(row.source_reference),
      license_name: licenseName,
      license_reference: asText(row.license_reference),
      retrieved_at: asText(row.retrieved_at),
      ingestion_batch_ids: batchIdsBySourceRecord.get(id) ?? [],
    };
    provenanceByFood.set(foodId, [...(provenanceByFood.get(foodId) ?? []), item]);
  }

  const candidates = foods.map((raw) => {
    const row = asRecord(raw);
    const id = asText(row.id) ?? "";
    return {
      id,
      food_name: asText(row.food_name) ?? "Food",
      brand_name: asText(row.brand_name),
      serving_size: asText(row.serving_size),
      category: asText(row.category),
      cuisine: asText(row.cuisine),
      calories: asNumber(row.calories),
      protein_g: asNumber(row.protein_g),
      carbs_g: asNumber(row.carbs_g),
      fat_g: asNumber(row.fat_g),
      lifecycle_status: lifecycle(row.lifecycle_status),
      is_verified: row.is_verified === true,
      verified_at: asText(row.verified_at),
      verified_source_record_id: asText(row.verified_source_record_id),
      merged_into_food_id: asText(row.merged_into_food_id),
      provenance: provenanceByFood.get(id) ?? [],
    } satisfies FoodCatalogCandidateReview;
  });

  candidates.sort((a, b) => {
    const priority = (status: FoodCatalogCandidateReview["lifecycle_status"]) => status === "draft" ? 0 : status === "active" ? 1 : status === "deprecated" ? 2 : status === "withdrawn" ? 3 : 4;
    return priority(a.lifecycle_status) - priority(b.lifecycle_status) || a.food_name.localeCompare(b.food_name);
  });
  return { candidates };
}

function cleanOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : value.trim() || null;
}

function cleanNutritionValue(value: number | null | undefined, label: string) {
  if (value === undefined || value === null) return value;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number or unknown.`);
  return value;
}

export async function normalizeFood(
  supabase: SupabaseClient,
  actor: FoodCatalogActor,
  input: FoodNormalizationInput,
) {
  assertFoodCatalogOwner(actor);
  if (!input.foodId) throw new Error("Food ID is required.");
  const update: Record<string, string | number | null> = {};
  if (input.food_name !== undefined) {
    const name = input.food_name.trim();
    if (!name) throw new Error("Normalized Food name is required.");
    update.food_name = name;
  }
  if (input.serving_size !== undefined) update.serving_size = cleanOptionalText(input.serving_size) ?? "Serving";
  if (input.category !== undefined) update.category = cleanOptionalText(input.category) ?? "Other";
  if (input.cuisine !== undefined) update.cuisine = cleanOptionalText(input.cuisine) ?? null;
  if (input.calories !== undefined) update.calories = cleanNutritionValue(input.calories, "Calories") ?? null;
  if (input.protein_g !== undefined) update.protein_g = cleanNutritionValue(input.protein_g, "Protein") ?? null;
  if (input.carbs_g !== undefined) update.carbs_g = cleanNutritionValue(input.carbs_g, "Carbs") ?? null;
  if (input.fat_g !== undefined) update.fat_g = cleanNutritionValue(input.fat_g, "Fat") ?? null;
  if (!Object.keys(update).length) throw new Error("At least one normalized Food field is required.");

  const result = await supabase
    .from("food_items")
    .update(update)
    .eq("id", input.foodId)
    .select("id,food_name,serving_size,category,cuisine,calories,protein_g,carbs_g,fat_g,lifecycle_status,is_verified")
    .single();
  return requiredData(result as unknown as DbResult<Record<string, unknown>>, "Food normalization");
}

export async function publishFood(
  supabase: SupabaseClient,
  actor: FoodCatalogActor,
  foodId: string,
) {
  assertFoodCatalogOwner(actor);
  const result = await supabase
    .from("food_items")
    .update({ lifecycle_status: "active", merged_into_food_id: null })
    .eq("id", foodId)
    .select("id,lifecycle_status,is_verified,merged_into_food_id")
    .single();
  return requiredData(result as unknown as DbResult<Record<string, unknown>>, "Food publication");
}

export async function verifyFood(
  supabase: SupabaseClient,
  actor: FoodCatalogActor,
  input: { foodId: string; sourceRecordId: string; verifiedAt?: string },
) {
  assertFoodCatalogOwner(actor);
  const provenanceResult = await supabase
    .from("food_source_records")
    .select("id,food_id,provider,source_record_id,source_dataset,source_version,source_release_date,source_record_checksum_sha256,source_reference,license_name,license_reference,retrieved_at")
    .eq("id", input.sourceRecordId)
    .eq("food_id", input.foodId)
    .maybeSingle();
  const provenance = optionalData(
    provenanceResult as unknown as DbResult<Record<string, unknown>>,
    "Food verification provenance read",
  );
  if (!provenance || !asText(provenance.license_name)) {
    throw new Error("Same-Food provenance with inspectable source and license evidence is required before verification.");
  }

  const verifiedAt = input.verifiedAt ?? new Date().toISOString();
  const update = {
    is_verified: true,
    verified_at: verifiedAt,
    verified_source_record_id: input.sourceRecordId,
  };
  const foodResult = await supabase
    .from("food_items")
    .update(update)
    .eq("id", input.foodId)
    .select("id,is_verified,verified_at,verified_source_record_id")
    .single();
  const food = requiredData(foodResult as unknown as DbResult<Record<string, unknown>>, "Food verification");
  return { ...food, provenance };
}

export async function unverifyFood(
  supabase: SupabaseClient,
  actor: FoodCatalogActor,
  foodId: string,
) {
  assertFoodCatalogOwner(actor);
  const result = await supabase
    .from("food_items")
    .update({ is_verified: false, verified_at: null, verified_source_record_id: null })
    .eq("id", foodId)
    .select("id,is_verified,verified_at,verified_source_record_id")
    .single();
  return requiredData(result as unknown as DbResult<Record<string, unknown>>, "Food unverification");
}

export async function mergeFood(
  supabase: SupabaseClient,
  actor: FoodCatalogActor,
  input: { sourceFoodId: string; targetFoodId: string },
) {
  assertFoodCatalogOwner(actor);
  if (!input.sourceFoodId || !input.targetFoodId) throw new Error("Source and target Food IDs are required.");
  if (input.sourceFoodId === input.targetFoodId) throw new Error("A Food cannot merge into itself.");

  const sourceResult = await supabase
    .from("food_items")
    .select("id,lifecycle_status,merged_into_food_id")
    .eq("id", input.sourceFoodId)
    .maybeSingle();
  const source = optionalData(sourceResult as unknown as DbResult<Record<string, unknown>>, "Merge source read");
  if (!source) throw new Error("Merge source Food was not found.");
  if (source.lifecycle_status === "merged" || asText(source.merged_into_food_id)) throw new Error("Merge source already redirects to another Food.");

  const targetResult = await supabase
    .from("food_items")
    .select("id,lifecycle_status,merged_into_food_id")
    .eq("id", input.targetFoodId)
    .maybeSingle();
  const target = optionalData(targetResult as unknown as DbResult<Record<string, unknown>>, "Merge target read");
  if (!target) throw new Error("Merge target Food was not found.");
  if (target.lifecycle_status === "merged" || asText(target.merged_into_food_id)) throw new Error("Merge target must be a canonical Food, not another redirect.");

  const favoritesResult = await supabase
    .from("food_favorites")
    .select("user_id")
    .eq("food_id", input.sourceFoodId);
  const favoriteRows = requiredData(
    favoritesResult as unknown as DbResult<Array<Record<string, unknown>>>,
    "Merge Favorites read",
  );
  const carryRows = favoriteRows
    .map((row) => asText(row.user_id))
    .filter((userId): userId is string => Boolean(userId))
    .map((userId) => ({ user_id: userId, food_id: input.targetFoodId }));
  if (carryRows.length) {
    const carryResult = await supabase
      .from("food_favorites")
      .upsert(carryRows, { onConflict: "user_id,food_id", ignoreDuplicates: true });
    if ((carryResult as unknown as DbResult<unknown>).error) {
      throw new Error(`Merge Favorites carry-forward: ${errorMessage((carryResult as unknown as DbResult<unknown>).error)}`);
    }
  }

  // Historical Food logs intentionally keep the source identity. New readers can
  // follow this durable redirect without mutating already-committed history.
  const redirectResult = await supabase
    .from("food_items")
    .update({ lifecycle_status: "merged", merged_into_food_id: input.targetFoodId })
    .eq("id", input.sourceFoodId)
    .select("id,lifecycle_status,merged_into_food_id")
    .single();
  return requiredData(redirectResult as unknown as DbResult<Record<string, unknown>>, "Food merge redirect");
}

export async function deprecateFood(
  supabase: SupabaseClient,
  actor: FoodCatalogActor,
  foodId: string,
) {
  assertFoodCatalogOwner(actor);
  const result = await supabase
    .from("food_items")
    .update({ lifecycle_status: "deprecated" })
    .eq("id", foodId)
    .select("id,lifecycle_status,merged_into_food_id")
    .single();
  return requiredData(result as unknown as DbResult<Record<string, unknown>>, "Food deprecation");
}

export async function restoreFood(
  supabase: SupabaseClient,
  actor: FoodCatalogActor,
  foodId: string,
) {
  assertFoodCatalogOwner(actor);
  const result = await supabase
    .from("food_items")
    .update({ lifecycle_status: "active", merged_into_food_id: null })
    .eq("id", foodId)
    .select("id,lifecycle_status,merged_into_food_id")
    .single();
  return requiredData(result as unknown as DbResult<Record<string, unknown>>, "Food restoration");
}