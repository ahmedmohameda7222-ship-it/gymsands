import type {
  FoodCatalogCandidateInput,
  FoodCatalogNormalizedCandidate
} from "./contracts";

export function normalizeGtin(_value: string): string | null {
  return null;
}

export function isValidGtinCheckDigit(_gtin: string): boolean {
  return false;
}

export function normalizeFoodCatalogCandidate(
  candidate: FoodCatalogCandidateInput
): FoodCatalogNormalizedCandidate {
  return {
    ...candidate,
    aliases: candidate.aliases.map((alias) => ({ ...alias, normalizedValue: "" }))
  };
}
