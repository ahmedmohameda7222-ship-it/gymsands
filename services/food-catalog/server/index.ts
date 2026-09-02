import "server-only";

export type {
  CatalogFoodNutrition,
  FoodCatalogDomainBundle,
  FoodCatalogLifecycle,
  FoodCatalogRootRecord,
  ResolvedCatalogFood,
  StoredFoodMarketAssignment,
  StoredFoodMergeEvent,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";
export type { FoodCatalogReadStore, FoodCatalogWriteStore } from "./store";
export type { FoodCatalogCompatibilitySelection } from "./compatibility-projection";
export type {
  CurrentGenerationCompatibilitySelection,
  CurrentGenerationFoodView,
} from "./current-generation-service";
export { projectFoodCatalogCompatibility } from "./compatibility-projection";
export {
  getCurrentGenerationFood,
  projectCurrentGenerationCompatibility,
  resolveCurrentGenerationFoodForNewUse,
} from "./current-generation-service";
export { getFoodCatalogDomainBundle, resolveCanonicalRootForNewUse } from "./read-service";
