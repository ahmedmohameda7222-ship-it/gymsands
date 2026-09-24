import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCurrentGenerationTrustForNewUseBatchFromSupabase } from "@/services/food-catalog/server/current-generation-service";

export async function getCurrentCatalogTrustStates(
  catalogSupabase: SupabaseClient,
  foodIds: readonly string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = Array.from(new Set(foodIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())));
  if (!uniqueIds.length) return new Map();

  const batch = await resolveCurrentGenerationTrustForNewUseBatchFromSupabase(catalogSupabase, uniqueIds);
  return new Map(uniqueIds.map((foodId) => [foodId, batch.get(foodId)?.trust?.verified === true]));
}
