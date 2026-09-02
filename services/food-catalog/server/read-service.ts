import "server-only";

import { isUuid } from "@/lib/utils";
import type { FoodCatalogDomainBundle, FoodCatalogRootRecord } from "./contracts";
import type { FoodCatalogReadStore } from "./store";

export async function resolveCanonicalRootForNewUse(
  store: FoodCatalogReadStore,
  foodId: string,
): Promise<FoodCatalogRootRecord> {
  if (!isUuid(foodId)) {
    throw new Error("Food is unavailable.");
  }

  const root = await store.readRoot(foodId);
  if (!root) {
    throw new Error("Food is unavailable.");
  }

  if (root.lifecycleStatus === "active" && root.mergedIntoFoodId === null) {
    return root;
  }

  if (root.lifecycleStatus !== "merged" || !root.mergedIntoFoodId) {
    throw new Error("Food is unavailable for new Nutrition writes.");
  }

  const survivor = await store.readRoot(root.mergedIntoFoodId);
  if (
    !survivor
    || survivor.lifecycleStatus !== "active"
    || survivor.mergedIntoFoodId !== null
  ) {
    throw new Error("Food merge redirect is not flattened to a current active survivor.");
  }

  return survivor;
}

export async function getFoodCatalogDomainBundle(
  store: FoodCatalogReadStore,
  foodId: string,
): Promise<FoodCatalogDomainBundle> {
  const root = await resolveCanonicalRootForNewUse(store, foodId);

  const [
    nutritionRevisions,
    servingOptions,
    names,
    taxonomyAssignments,
    marketAssignments,
    verificationAssertions,
    mergeEvents,
  ] = await Promise.all([
    store.readNutritionRevisions(root.id),
    store.readServingOptions(root.id),
    store.readNames(root.id),
    store.readTaxonomyAssignments(root.id),
    store.readMarketAssignments(root.id),
    store.readVerificationAssertions(root.id),
    store.readMergeEvents(root.id),
  ]);

  return {
    requestedFoodId: foodId,
    root,
    nutritionRevisions,
    servingOptions,
    names,
    taxonomyAssignments,
    marketAssignments,
    verificationAssertions,
    mergeEvents,
  };
}
