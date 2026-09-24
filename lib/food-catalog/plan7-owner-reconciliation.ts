export type OwnerFavoriteClassification = "catalog_food" | "my_food" | "legacy_text" | "blocked";

export type OwnerFavoriteDisposition =
  | "catalog_mappable"
  | "catalog_already_mapped"
  | "my_food_preserved"
  | "legacy_text_preserved"
  | "blocked";

export type OwnerFavoriteBlockedReason =
  | "invalid_owner"
  | "malformed_key"
  | "unknown_uuid"
  | "cross_owner_my_food"
  | "deleted_my_food"
  | "ambiguous_uuid";

export type LegacyOwnerFavoriteRow = {
  userId: string;
  foodKey: string;
};

export type OwnerFoodEvidence = {
  id: string;
  userId: string;
  deletedAt: string | null;
};

export type OwnerFavoriteEvidence = {
  catalogFoodIds: readonly string[];
  myFoods: readonly OwnerFoodEvidence[];
  existingCatalogFavoriteFoodIds: readonly string[];
};

export type OwnerFavoriteReconciliation = {
  classification: OwnerFavoriteClassification;
  disposition: OwnerFavoriteDisposition;
  reason?: OwnerFavoriteBlockedReason;
};

export type OwnerFavoriteReconciliationSummary = {
  total: number;
  catalog_mappable: number;
  catalog_already_mapped: number;
  my_food_preserved: number;
  legacy_text_preserved: number;
  blocked: number;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_SHAPE =
  /^[0-9A-Za-z]{8}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{12}$/;

function normalizedUuid(value: string) {
  return value.toLowerCase();
}

function isLegacyTextKey(value: string) {
  const separator = value.indexOf("|");
  if (separator <= 0 || separator === value.length - 1) return false;
  return value.slice(0, separator).trim().length > 0
    && value.slice(separator + 1).trim().length > 0;
}

function blocked(reason: OwnerFavoriteBlockedReason): OwnerFavoriteReconciliation {
  return { classification: "blocked", disposition: "blocked", reason };
}

export function classifyOwnerFavorite(
  row: LegacyOwnerFavoriteRow,
  evidence: OwnerFavoriteEvidence,
): OwnerFavoriteReconciliation {
  if (!UUID.test(row.userId)) return blocked("invalid_owner");

  const key = row.foodKey.trim();
  if (!UUID.test(key)) {
    if (UUID_SHAPE.test(key)) return blocked("malformed_key");
    if (isLegacyTextKey(key)) {
      return {
        classification: "legacy_text",
        disposition: "legacy_text_preserved",
      };
    }
    return blocked("malformed_key");
  }

  const ownerId = normalizedUuid(row.userId);
  const foodId = normalizedUuid(key);
  const catalogIds = new Set(evidence.catalogFoodIds.filter((id) => UUID.test(id)).map(normalizedUuid));
  const canonicalFavoriteIds = new Set(
    evidence.existingCatalogFavoriteFoodIds.filter((id) => UUID.test(id)).map(normalizedUuid),
  );
  const myFoodMatches = evidence.myFoods.filter(
    (candidate) => UUID.test(candidate.id) && normalizedUuid(candidate.id) === foodId,
  );

  if (catalogIds.has(foodId) && myFoodMatches.length > 0) {
    return blocked("ambiguous_uuid");
  }
  if (myFoodMatches.length > 1) {
    return blocked("ambiguous_uuid");
  }

  if (catalogIds.has(foodId)) {
    return {
      classification: "catalog_food",
      disposition: canonicalFavoriteIds.has(foodId)
        ? "catalog_already_mapped"
        : "catalog_mappable",
    };
  }

  if (myFoodMatches.length === 1) {
    const candidate = myFoodMatches[0]!;
    if (!UUID.test(candidate.userId) || normalizedUuid(candidate.userId) !== ownerId) {
      return blocked("cross_owner_my_food");
    }
    if (candidate.deletedAt !== null) {
      return blocked("deleted_my_food");
    }
    return {
      classification: "my_food",
      disposition: "my_food_preserved",
    };
  }

  return blocked("unknown_uuid");
}

export function summarizeOwnerFavoriteReconciliation(
  rows: readonly LegacyOwnerFavoriteRow[],
  evidence: OwnerFavoriteEvidence,
): OwnerFavoriteReconciliationSummary {
  const summary: OwnerFavoriteReconciliationSummary = {
    total: 0,
    catalog_mappable: 0,
    catalog_already_mapped: 0,
    my_food_preserved: 0,
    legacy_text_preserved: 0,
    blocked: 0,
  };

  for (const row of rows) {
    const result = classifyOwnerFavorite(row, evidence);
    summary.total += 1;
    summary[result.disposition] += 1;
  }
  return summary;
}
