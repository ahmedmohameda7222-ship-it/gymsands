import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCurrentGenerationFoodForNewUseFromSupabase } from "@/services/food-catalog/server/current-generation-service";

const DEFAULT_CONCURRENCY = 6;

export async function getCurrentCatalogTrustStates(
  catalogSupabase: SupabaseClient,
  foodIds: readonly string[],
  concurrency = DEFAULT_CONCURRENCY,
): Promise<Map<string, boolean>> {
  const uniqueIds = Array.from(new Set(foodIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())));
  if (!uniqueIds.length) return new Map();

  const results = new Map<string, boolean>();
  const workerCount = Math.max(1, Math.min(uniqueIds.length, Math.trunc(concurrency) || DEFAULT_CONCURRENCY));
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= uniqueIds.length) return;
      const requestedFoodId = uniqueIds[index]!;
      try {
        const view = await resolveCurrentGenerationFoodForNewUseFromSupabase(catalogSupabase, requestedFoodId);
        results.set(requestedFoodId, view.trust.verified === true);
      } catch {
        results.set(requestedFoodId, false);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
