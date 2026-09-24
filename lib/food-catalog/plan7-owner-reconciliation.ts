export type OwnerFavoriteRow = {
  userId: string;
  foodKey: string;
};

export type OwnerFavoriteResolutionFacts = {
  catalogFoods: Array<{ id: string }>;
  myFoods: Array<{ id: string; userId: string; deletedAt: string | null }>;
  catalogFavoriteAlreadyExists: boolean;
};

export type OwnerFavoriteClassification =
  | "catalog_food"
  | "my_food"
  | "legacy_text"
  | "blocked";

export type OwnerFavoriteDisposition =
  | "catalog_mappable"
  | "catalog_already_mapped"
  | "my_food_preserved"
  | "legacy_text_preserved"
  | "blocked";

export type OwnerFavoriteBlockedReason =
  | "ambiguous_uuid"
  | "cross_owner_my_food"
  | "deleted_my_food"
  | "unknown_uuid"
  | "malformed_key";

export type OwnerFavoriteClassificationResult = {
  classification: OwnerFavoriteClassification;
  disposition: OwnerFavoriteDisposition;
  reason: OwnerFavoriteBlockedReason | null;
  foodId: string | null;
};

export type OwnerFavoriteReconciliationSummary = {
  total: number;
  catalog_mappable: number;
  catalog_already_mapped: number;
  my_food_preserved: number;
  legacy_text_preserved: number;
  blocked: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_LIKE = /^[0-9a-f-]{20,}$/iu;

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function isLegacyTextKey(value: string) {
  const separator = value.indexOf("|");
  return separator > 0 && separator < value.length - 1
    && value.slice(0, separator).trim().length > 0
    && value.slice(separator + 1).trim().length > 0;
}

export function classifyOwnerFavorite(
  row: OwnerFavoriteRow,
  facts: OwnerFavoriteResolutionFacts,
): OwnerFavoriteClassificationResult {
  const foodKey = normalized(row.foodKey);
  const ownerId = normalized(row.userId);

  if (!UUID.test(foodKey)) {
    if (isLegacyTextKey(foodKey) && !UUID_LIKE.test(foodKey)) {
      return {
        classification: "legacy_text",
        disposition: "legacy_text_preserved",
        reason: null,
        foodId: null,
      };
    }
    return {
      classification: "blocked",
      disposition: "blocked",
      reason: "malformed_key",
      foodId: null,
    };
  }

  const catalogMatches = facts.catalogFoods.filter((food) => normalized(food.id) === foodKey);
  const myFoodMatches = facts.myFoods.filter((food) => normalized(food.id) === foodKey);

  if (catalogMatches.length > 1 || myFoodMatches.length > 1 || (catalogMatches.length > 0 && myFoodMatches.length > 0)) {
    return {
      classification: "blocked",
      disposition: "blocked",
      reason: "ambiguous_uuid",
      foodId: null,
    };
  }

  if (catalogMatches.length === 1) {
    return {
      classification: "catalog_food",
      disposition: facts.catalogFavoriteAlreadyExists ? "catalog_already_mapped" : "catalog_mappable",
      reason: null,
      foodId: catalogMatches[0]!.id,
    };
  }

  if (myFoodMatches.length === 1) {
    const myFood = myFoodMatches[0]!;
    if (normalized(myFood.userId) !== ownerId) {
      return {
        classification: "blocked",
        disposition: "blocked",
        reason: "cross_owner_my_food",
        foodId: null,
      };
    }
    if (myFood.deletedAt !== null) {
      return {
        classification: "blocked",
        disposition: "blocked",
        reason: "deleted_my_food",
        foodId: null,
      };
    }
    return {
      classification: "my_food",
      disposition: "my_food_preserved",
      reason: null,
      foodId: myFood.id,
    };
  }

  return {
    classification: "blocked",
    disposition: "blocked",
    reason: "unknown_uuid",
    foodId: null,
  };
}

export function summarizeOwnerFavoriteClassifications(
  rows: readonly OwnerFavoriteClassificationResult[],
): OwnerFavoriteReconciliationSummary {
  const summary: OwnerFavoriteReconciliationSummary = {
    total: rows.length,
    catalog_mappable: 0,
    catalog_already_mapped: 0,
    my_food_preserved: 0,
    legacy_text_preserved: 0,
    blocked: 0,
  };
  for (const row of rows) summary[row.disposition] += 1;
  return summary;
}
