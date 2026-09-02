import "server-only";

import type { FoodMergeEvent } from "@/lib/food-catalog/domain/identity";
import type { FoodMarketAssignment } from "@/lib/food-catalog/domain/markets";
import type { FoodNameFact } from "@/lib/food-catalog/domain/names";
import type { FoodNutritionRevision } from "@/lib/food-catalog/domain/nutrition";
import type { FoodServingOption } from "@/lib/food-catalog/domain/servings";
import type { FoodTaxonomyAssignment } from "@/lib/food-catalog/domain/taxonomy";
import type { FoodVerificationAssertion } from "@/lib/food-catalog/domain/verification";
import type {
  FoodCatalogRootRecord,
  StoredFoodMarketAssignment,
  StoredFoodMergeEvent,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";

export interface FoodCatalogReadStore {
  readRoot(foodId: string): Promise<FoodCatalogRootRecord | null>;
  readNutritionRevisions(foodId: string): Promise<StoredFoodNutritionRevision[]>;
  readServingOptions(foodId: string): Promise<StoredFoodServingOption[]>;
  readNames(foodId: string): Promise<StoredFoodNameFact[]>;
  readTaxonomyAssignments(foodId: string): Promise<StoredFoodTaxonomyAssignment[]>;
  readMarketAssignments(foodId: string): Promise<StoredFoodMarketAssignment[]>;
  readVerificationAssertions(foodId: string): Promise<StoredFoodVerificationAssertion[]>;
  readMergeEvents(foodId: string): Promise<StoredFoodMergeEvent[]>;
}

export interface FoodCatalogWriteStore {
  appendNutritionRevision(value: FoodNutritionRevision): Promise<void>;
  appendServingOption(value: FoodServingOption): Promise<void>;
  appendName(value: FoodNameFact): Promise<void>;
  appendTaxonomyAssignment(value: FoodTaxonomyAssignment): Promise<void>;
  appendMarketAssignment(value: FoodMarketAssignment): Promise<void>;
  appendVerificationAssertion(value: FoodVerificationAssertion): Promise<void>;
  appendMergeEvent(value: FoodMergeEvent): Promise<void>;
}
