import "server-only";

export type {
  CatalogFoodNutrition,
  ResolvedCatalogFood,
} from "@/services/food-catalog/server/contracts";
export {
  findCatalogDuplicateByName,
  getCatalogVerificationStates,
  resolveCatalogFood,
  searchCatalogFoodsByName,
} from "@/services/food-catalog/server/legacy-compatibility";
