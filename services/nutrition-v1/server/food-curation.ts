import type { SupabaseClient } from "@supabase/supabase-js";

export type FoodCatalogActor = {
  authorized?: boolean;
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

const RETIRED_MESSAGE =
  "Legacy Food Catalog curation is retired. Use Plan 6 named governance commands and explicit correction cases.";

export function assertFoodCatalogOwner(actor: FoodCatalogActor) {
  if (actor.authorized !== true) {
    throw new Error("Food Catalog inspection authorization is required.");
  }
}

function retiredFoodCatalogCuration(actor: FoodCatalogActor): never {
  assertFoodCatalogOwner(actor);
  throw new Error(RETIRED_MESSAGE);
}

export async function listFoodCatalogCandidates(
  _supabase: SupabaseClient,
  actor: FoodCatalogActor,
  _options: { limit?: number } = {},
): Promise<FoodCatalogSnapshot> {
  return retiredFoodCatalogCuration(actor);
}

export async function normalizeFood(
  _supabase: SupabaseClient,
  actor: FoodCatalogActor,
  _input: FoodNormalizationInput,
) {
  return retiredFoodCatalogCuration(actor);
}

export async function publishFood(
  _supabase: SupabaseClient,
  actor: FoodCatalogActor,
  _foodId: string,
) {
  return retiredFoodCatalogCuration(actor);
}

export async function verifyFood(
  _supabase: SupabaseClient,
  actor: FoodCatalogActor,
  _input: { foodId: string; sourceRecordId: string; verifiedAt?: string },
) {
  return retiredFoodCatalogCuration(actor);
}

export async function unverifyFood(
  _supabase: SupabaseClient,
  actor: FoodCatalogActor,
  _foodId: string,
) {
  return retiredFoodCatalogCuration(actor);
}

export async function mergeFood(
  _supabase: SupabaseClient,
  actor: FoodCatalogActor,
  _input: { sourceFoodId: string; targetFoodId: string },
) {
  return retiredFoodCatalogCuration(actor);
}

export async function deprecateFood(
  _supabase: SupabaseClient,
  actor: FoodCatalogActor,
  _foodId: string,
) {
  return retiredFoodCatalogCuration(actor);
}

export async function restoreFood(
  _supabase: SupabaseClient,
  actor: FoodCatalogActor,
  _foodId: string,
) {
  return retiredFoodCatalogCuration(actor);
}
