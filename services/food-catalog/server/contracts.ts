import "server-only";

import type { FoodMergeEvent } from "@/lib/food-catalog/domain/identity";
import type { FoodMarketAssignment } from "@/lib/food-catalog/domain/markets";
import type { FoodNameFact } from "@/lib/food-catalog/domain/names";
import type { FoodNutritionRevision } from "@/lib/food-catalog/domain/nutrition";
import type { FoodServingOption } from "@/lib/food-catalog/domain/servings";
import type { FoodTaxonomyAssignment } from "@/lib/food-catalog/domain/taxonomy";
import type { FoodVerificationAssertion } from "@/lib/food-catalog/domain/verification";

export type FoodCatalogLifecycle = "draft" | "active" | "deprecated" | "withdrawn" | "merged";

export type FoodCatalogRootRecord = {
  id: string;
  lifecycleStatus: FoodCatalogLifecycle;
  mergedIntoFoodId: string | null;
};

export type StoredFoodNutritionRevision = FoodNutritionRevision & { id: string; createdAt: string };
export type StoredFoodServingOption = FoodServingOption & { id: string; createdAt: string };
export type StoredFoodNameFact = FoodNameFact & { id: string; createdAt: string };
export type StoredFoodTaxonomyAssignment = FoodTaxonomyAssignment & { id: string; createdAt: string };
export type StoredFoodMarketAssignment = FoodMarketAssignment & { id: string; createdAt: string };
export type StoredFoodVerificationAssertion = FoodVerificationAssertion & { id: string; createdAt: string };
export type StoredFoodMergeEvent = FoodMergeEvent & { id: string; createdAt: string };

export type FoodCatalogDomainBundle = {
  requestedFoodId: string;
  root: FoodCatalogRootRecord;
  nutritionRevisions: StoredFoodNutritionRevision[];
  servingOptions: StoredFoodServingOption[];
  names: StoredFoodNameFact[];
  taxonomyAssignments: StoredFoodTaxonomyAssignment[];
  marketAssignments: StoredFoodMarketAssignment[];
  verificationAssertions: StoredFoodVerificationAssertion[];
  mergeEvents: StoredFoodMergeEvent[];
};

export type CatalogFoodNutrition = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  fiber_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  basis_amount: number | null;
  basis_unit: "g" | "ml" | "serving" | "piece" | "custom" | null;
};

export type ResolvedCatalogFood = {
  id: string;
  name: string;
  servingLabel: string;
  nutrition: CatalogFoodNutrition;
  verified: boolean;
};
