import type {
  FoodCatalogNormalizedCandidate,
  FoodCatalogValidationIssue,
  FoodCatalogValidationIssueCode
} from "./contracts";
import { isValidGtinCheckDigit } from "./normalize";

const NUTRIENT_FIELDS = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "saturated_fat_g",
  "fiber_g",
  "sugars_g",
  "sodium_mg"
] as const;

const SHA256 = /^[a-f0-9]{64}$/i;
const GTIN = /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;
const COUNTRY_SCOPE = /^[A-Z]{2}$/;
const REGION_SCOPE = /^[A-Z][A-Z0-9_-]{1,15}$/;

function isValidLocaleTag(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export function validateFoodCatalogCandidate(
  candidate: FoodCatalogNormalizedCandidate
): FoodCatalogValidationIssue[] {
  const issues: FoodCatalogValidationIssue[] = [];
  const issueKeys = new Set<string>();

  const addIssue = (
    code: FoodCatalogValidationIssueCode,
    severity: FoodCatalogValidationIssue["severity"],
    field: string | null
  ) => {
    const key = `${code}\u0000${severity}\u0000${field ?? ""}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push({ code, severity, field });
  };

  if (!candidate.canonicalName.trim()) addIssue("missing_name", "error", "canonicalName");
  if (!candidate.sourceRecordId.trim()) addIssue("missing_source_id", "error", "sourceRecordId");

  if (
    candidate.sourceRecordChecksumSha256 !== null
    && !SHA256.test(candidate.sourceRecordChecksumSha256)
  ) {
    addIssue("invalid_source_checksum", "error", "sourceRecordChecksumSha256");
  }

  const hasInvalidNutrient = NUTRIENT_FIELDS.some((field) => {
    const value = candidate.nutrition[field];
    return value !== null && (!Number.isFinite(value) || value < 0);
  });
  if (hasInvalidNutrient) addIssue("invalid_nutrition", "error", "nutrition");

  const hasNutrition = NUTRIENT_FIELDS.some((field) => candidate.nutrition[field] !== null);
  const { basis_amount: basisAmount, basis_unit: basisUnit } = candidate.nutrition;
  const validBasis = basisAmount !== null
    && Number.isFinite(basisAmount)
    && basisAmount > 0
    && (basisUnit === "g" || basisUnit === "ml");
  const hasAnyBasis = basisAmount !== null || basisUnit !== null;
  if ((hasNutrition && !validBasis) || (!hasNutrition && hasAnyBasis)) {
    addIssue("invalid_basis", "error", "nutrition.basis");
  }

  if (
    candidate.aliases.some((alias) =>
      !alias.locale.trim()
      || !isValidLocaleTag(alias.locale)
      || !alias.value.trim()
      || !alias.normalizedValue.trim()
    )
  ) {
    addIssue("invalid_alias", "error", "aliases");
  }

  if (
    candidate.marketScopes.some((scope) => {
      if (scope.relevanceLevel !== "primary" && scope.relevanceLevel !== "secondary") return true;
      if (scope.type === "country") return !COUNTRY_SCOPE.test(scope.code);
      if (scope.type === "region") return !REGION_SCOPE.test(scope.code);
      return true;
    })
  ) {
    addIssue("invalid_market_scope", "error", "marketScopes");
  }

  const gtinCounts = new Map<string, number>();
  for (const gtin of candidate.gtins) {
    gtinCounts.set(gtin, (gtinCounts.get(gtin) ?? 0) + 1);
    if (!GTIN.test(gtin)) {
      addIssue("invalid_gtin", "error", "gtins");
      continue;
    }
    if (!isValidGtinCheckDigit(gtin)) {
      addIssue("invalid_gtin_check_digit", "error", "gtins");
    }
  }
  if ([...gtinCounts.values()].some((count) => count > 1)) {
    addIssue("duplicate_gtin_in_candidate", "error", "gtins");
  }

  const { calories, protein_g: protein, carbs_g: carbs, fat_g: fat } = candidate.nutrition;
  if (
    calories !== null
    && protein !== null
    && carbs !== null
    && fat !== null
    && [calories, protein, carbs, fat].every((value) => Number.isFinite(value) && value >= 0)
  ) {
    const macroCalories = protein * 4 + carbs * 4 + fat * 9;
    const discrepancy = Math.abs(calories - macroCalories);
    if (discrepancy > Math.max(80, calories * 0.3)) {
      addIssue("suspicious_calorie_macro_delta", "warning", "nutrition.calories");
    }
  }

  return issues;
}
