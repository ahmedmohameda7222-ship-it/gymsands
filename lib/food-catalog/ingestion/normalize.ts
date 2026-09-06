import type {
  FoodCatalogAlias,
  FoodCatalogCandidateInput,
  FoodCatalogIdentityEvidence,
  FoodCatalogMarketScope,
  FoodCatalogNameEvidence,
  FoodCatalogNormalizedCandidate,
  FoodCatalogServingEvidence,
  FoodCatalogSourceDescriptor,
  FoodCatalogTaxonomyEvidence
} from "./contracts";

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

function compareStableStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function nullableCollapsed(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const collapsed = collapseWhitespace(value);
  return collapsed.length > 0 ? collapsed : null;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareStableStrings(left, right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

function stableKey(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function uniqueSorted<T>(values: readonly T[], key: (value: T) => string): T[] {
  const entries = new Map<string, T>();
  for (const value of values) {
    const semanticKey = key(value);
    const existing = entries.get(semanticKey);
    if (existing === undefined || compareStableStrings(stableKey(value), stableKey(existing)) < 0) {
      entries.set(semanticKey, value);
    }
  }
  return [...entries.entries()]
    .sort(([left], [right]) => compareStableStrings(left, right))
    .map(([, value]) => value);
}

function normalizeAliases(candidate: FoodCatalogCandidateInput): FoodCatalogAlias[] {
  return uniqueSorted(
    candidate.aliases.map((alias) => {
      const locale = collapseWhitespace(alias.locale).toLowerCase();
      const value = collapseWhitespace(alias.value);
      return { locale, value, normalizedValue: value.toLowerCase() };
    }),
    (alias) => `${alias.locale}\u0000${alias.normalizedValue}`
  );
}

function normalizeNames(candidate: FoodCatalogCandidateInput): FoodCatalogNameEvidence[] {
  return uniqueSorted(
    (candidate.names ?? []).map((name) => {
      const locale = collapseWhitespace(name.locale).toLowerCase();
      const value = collapseWhitespace(name.value);
      return {
        locale,
        script: nullableCollapsed(name.script),
        role: name.role,
        value,
        normalizedValue: value.toLowerCase()
      };
    }),
    (name) => `${name.locale}\u0000${name.script ?? ""}\u0000${name.role}\u0000${name.normalizedValue}`
  );
}

function normalizeIdentityEvidence(candidate: FoodCatalogCandidateInput): FoodCatalogIdentityEvidence {
  const evidence = candidate.identityEvidence;
  return {
    semanticSignature: nullableCollapsed(evidence?.semanticSignature),
    preparation: nullableCollapsed(evidence?.preparation),
    state: nullableCollapsed(evidence?.state),
    form: nullableCollapsed(evidence?.form),
    structuredEvidenceKey: nullableCollapsed(evidence?.structuredEvidenceKey)
  };
}

function normalizeServings(candidate: FoodCatalogCandidateInput): FoodCatalogServingEvidence[] {
  return uniqueSorted(
    (candidate.servings ?? []).map((serving) => ({
      ...serving,
      servingKey: collapseWhitespace(serving.servingKey),
      unit: collapseWhitespace(serving.unit).toLowerCase(),
      label: nullableCollapsed(serving.label)
    })),
    stableKey
  );
}

function normalizeTaxonomy(candidate: FoodCatalogCandidateInput): FoodCatalogTaxonomyEvidence[] {
  return uniqueSorted(
    (candidate.taxonomyEvidence ?? []).map((evidence) => ({
      taxonomy: collapseWhitespace(evidence.taxonomy),
      sourceCode: nullableCollapsed(evidence.sourceCode),
      mappedTaxonomyId: nullableCollapsed(evidence.mappedTaxonomyId)
    })),
    stableKey
  );
}

export function normalizeGtin(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isValidGtinCheckDigit(value: string): boolean {
  if (!/^\d+$/.test(value) || !GTIN_LENGTHS.has(value.length)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop();
  if (check === undefined) return false;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function normalizeMarketScopes(candidate: FoodCatalogCandidateInput): FoodCatalogMarketScope[] {
  return uniqueSorted(
    candidate.marketScopes.map((scope) => ({
      ...scope,
      code: collapseWhitespace(scope.code).toUpperCase()
    })),
    (scope) => `${scope.type}\u0000${scope.code}\u0000${scope.relevanceLevel}`
  );
}

export function normalizeFoodCatalogSourceDescriptor(
  source: FoodCatalogSourceDescriptor
): FoodCatalogSourceDescriptor {
  return {
    ...source,
    sourceChecksumSha256: source.sourceChecksumSha256.toLowerCase(),
    configChecksumSha256: source.configChecksumSha256.toLowerCase()
  };
}

export function normalizeFoodCatalogCandidate(
  candidate: FoodCatalogCandidateInput
): FoodCatalogNormalizedCandidate {
  const gtins = [...new Set(candidate.gtins.map(normalizeGtin))]
    .sort(compareStableStrings);

  return {
    ...candidate,
    sourceRecordId: collapseWhitespace(candidate.sourceRecordId),
    sourceReference: nullableCollapsed(candidate.sourceReference),
    sourceRecordChecksumSha256: candidate.sourceRecordChecksumSha256?.toLowerCase() ?? null,
    canonicalName: collapseWhitespace(candidate.canonicalName),
    brandName: nullableCollapsed(candidate.brandName),
    servingLabel: nullableCollapsed(candidate.servingLabel),
    category: nullableCollapsed(candidate.category),
    cuisine: nullableCollapsed(candidate.cuisine),
    aliases: normalizeAliases(candidate),
    names: normalizeNames(candidate),
    identityEvidence: normalizeIdentityEvidence(candidate),
    servings: normalizeServings(candidate),
    taxonomyEvidence: normalizeTaxonomy(candidate),
    gtins,
    marketScopes: normalizeMarketScopes(candidate)
  };
}

export const normalizeCandidate = normalizeFoodCatalogCandidate;
