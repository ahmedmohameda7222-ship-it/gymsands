import type {
  FoodCatalogAlias,
  FoodCatalogCandidateInput,
  FoodCatalogMarketScope,
  FoodCatalogNormalizedCandidate
} from "./contracts";

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeOptionalDisplay(value: string | null): string | null {
  return value === null ? null : collapseWhitespace(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeAliases(aliases: FoodCatalogCandidateInput["aliases"]): FoodCatalogAlias[] {
  const normalized = aliases
    .map((alias) => {
      const locale = collapseWhitespace(alias.locale).toLowerCase();
      const value = collapseWhitespace(alias.value);
      return {
        locale,
        value,
        normalizedValue: value.toLowerCase()
      };
    })
    .sort((left, right) =>
      compareText(left.locale, right.locale)
      || compareText(left.normalizedValue, right.normalizedValue)
      || compareText(left.value, right.value)
    );

  const seen = new Set<string>();
  return normalized.filter((alias) => {
    const key = `${alias.locale}\u0000${alias.normalizedValue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeGtins(gtins: string[]): string[] {
  const normalized = gtins.map((value) => normalizeGtin(value) ?? collapseWhitespace(value));
  return [...new Set(normalized)].sort(compareText);
}

function normalizeMarketScopes(scopes: FoodCatalogMarketScope[]): FoodCatalogMarketScope[] {
  const normalized = scopes
    .map((scope) => ({
      ...scope,
      code: collapseWhitespace(scope.code).toUpperCase()
    }))
    .sort((left, right) =>
      compareText(left.type, right.type)
      || compareText(left.code, right.code)
      || compareText(left.relevanceLevel, right.relevanceLevel)
    );

  const seen = new Set<string>();
  return normalized.filter((scope) => {
    const key = `${scope.type}\u0000${scope.code}\u0000${scope.relevanceLevel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeGtin(value: string): string | null {
  const compact = value.trim().replace(/[ -]/g, "");
  if (!/^\d+$/.test(compact) || !GTIN_LENGTHS.has(compact.length)) return null;
  return compact;
}

export function isValidGtinCheckDigit(gtin: string): boolean {
  const normalized = normalizeGtin(gtin);
  if (!normalized) return false;

  const body = normalized.slice(0, -1);
  let sum = 0;
  for (let index = body.length - 1, offset = 0; index >= 0; index -= 1, offset += 1) {
    const digit = Number(body[index]);
    sum += digit * (offset % 2 === 0 ? 3 : 1);
  }

  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(normalized.at(-1));
}

export function normalizeFoodCatalogCandidate(
  candidate: FoodCatalogCandidateInput
): FoodCatalogNormalizedCandidate {
  return {
    ...candidate,
    sourceRecordId: collapseWhitespace(candidate.sourceRecordId),
    sourceReference: normalizeOptionalDisplay(candidate.sourceReference),
    sourceRecordChecksumSha256: normalizeOptionalDisplay(candidate.sourceRecordChecksumSha256),
    canonicalName: collapseWhitespace(candidate.canonicalName),
    brandName: normalizeOptionalDisplay(candidate.brandName),
    servingLabel: normalizeOptionalDisplay(candidate.servingLabel),
    category: normalizeOptionalDisplay(candidate.category),
    cuisine: normalizeOptionalDisplay(candidate.cuisine),
    nutrition: { ...candidate.nutrition },
    aliases: normalizeAliases(candidate.aliases),
    gtins: normalizeGtins(candidate.gtins),
    marketScopes: normalizeMarketScopes(candidate.marketScopes)
  };
}
