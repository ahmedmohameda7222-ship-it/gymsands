import type {
  FoodCatalogCanonicalDecision,
  FoodCatalogNormalizedCandidate,
  FoodCatalogSourceDescriptor
} from "./contracts";

export type FoodCatalogSourceIdentityOwner = {
  provider: string;
  dataset: string;
  sourceVersion: string;
  sourceRecordId: string;
  foodId: string;
};

export type FoodCatalogGtinOwner = {
  gtin: string;
  foodId: string;
};

export type FoodCatalogRedirect = {
  sourceFoodId: string;
  targetFoodId: string;
};

export type FoodCatalogSemanticIdentityOwner = {
  semanticSignature: string;
  foodId: string;
};

export type FoodCatalogQualifiedAliasOwner = {
  normalizedAlias: string;
  state: string;
  preparation: string;
  form: string;
  foodId: string;
};

export type FoodCatalogPossibleDuplicateNameOwner = {
  normalizedName: string;
  foodId: string;
};

export type FoodCatalogMatchIndex = {
  sourceIdentities: FoodCatalogSourceIdentityOwner[];
  gtinOwners: FoodCatalogGtinOwner[];
  redirects: FoodCatalogRedirect[];
  semanticIdentities: FoodCatalogSemanticIdentityOwner[];
  qualifiedAliases: FoodCatalogQualifiedAliasOwner[];
  possibleDuplicateNames: FoodCatalogPossibleDuplicateNameOwner[];
};

export type DecideCanonicalMatchInput = {
  source: FoodCatalogSourceDescriptor;
  candidate: FoodCatalogNormalizedCandidate;
  index: FoodCatalogMatchIndex;
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function resolveRedirectRoot(foodId: string, redirects: readonly FoodCatalogRedirect[]): string | null {
  const visited = new Set<string>();
  let current = foodId;

  while (true) {
    if (visited.has(current)) return null;
    visited.add(current);

    const targets = uniqueSorted(
      redirects
        .filter((redirect) => redirect.sourceFoodId === current)
        .map((redirect) => redirect.targetFoodId)
    );
    if (targets.length === 0) return current;
    if (targets.length !== 1) return null;
    current = targets[0]!;
  }
}

function resolveOwnerRoots(
  ownerFoodIds: readonly string[],
  redirects: readonly FoodCatalogRedirect[]
): { roots: string[]; unresolved: boolean } {
  let unresolved = false;
  const roots = ownerFoodIds.map((foodId) => {
    const root = resolveRedirectRoot(foodId, redirects);
    if (root === null) {
      unresolved = true;
      return foodId;
    }
    return root;
  });
  return { roots: uniqueSorted(roots), unresolved };
}

function decideFromOwners(
  ownerFoodIds: readonly string[],
  redirects: readonly FoodCatalogRedirect[]
): FoodCatalogCanonicalDecision | null {
  const owners = uniqueSorted(ownerFoodIds);
  if (owners.length === 0) return null;

  const { roots, unresolved } = resolveOwnerRoots(owners, redirects);
  if (!unresolved && roots.length === 1) {
    return { kind: "match", foodId: roots[0]! };
  }
  return { kind: "possible_duplicate", candidateFoodIds: roots };
}

function sourceOwnerFoodIds({ source, candidate, index }: DecideCanonicalMatchInput): string[] {
  return index.sourceIdentities
    .filter((identity) =>
      identity.provider === source.provider &&
      identity.dataset === source.dataset &&
      identity.sourceVersion === source.sourceVersion &&
      identity.sourceRecordId === candidate.sourceRecordId
    )
    .map((identity) => identity.foodId);
}

function gtinOwnerFoodIds({ candidate, index }: DecideCanonicalMatchInput): string[] {
  const candidateGtins = new Set(candidate.gtins);
  return index.gtinOwners
    .filter((owner) => candidateGtins.has(owner.gtin))
    .map((owner) => owner.foodId);
}

function semanticOwnerFoodIds({ candidate, index }: DecideCanonicalMatchInput): string[] {
  if (candidate.identityEvidence.semanticSignature === null) return [];
  return index.semanticIdentities
    .filter((identity) =>
      identity.semanticSignature === candidate.identityEvidence.semanticSignature
    )
    .map((identity) => identity.foodId);
}

function qualifiedAliasOwnerFoodIds({ candidate, index }: DecideCanonicalMatchInput): string[] {
  const { state, preparation, form } = candidate.identityEvidence;
  if (state === null || preparation === null || form === null) return [];
  const aliases = new Set(candidate.aliases.map((alias) => alias.normalizedValue));
  return index.qualifiedAliases
    .filter((owner) =>
      aliases.has(owner.normalizedAlias) &&
      owner.state === state &&
      owner.preparation === preparation &&
      owner.form === form
    )
    .map((owner) => owner.foodId);
}

export function deriveCanonicalConflictReasons(input: DecideCanonicalMatchInput): string[] {
  const sourceRoots = resolveOwnerRoots(sourceOwnerFoodIds(input), input.index.redirects);
  const gtinRoots = resolveOwnerRoots(gtinOwnerFoodIds(input), input.index.redirects);
  const semanticRoots = resolveOwnerRoots(semanticOwnerFoodIds(input), input.index.redirects);
  const aliasRoots = resolveOwnerRoots(qualifiedAliasOwnerFoodIds(input), input.index.redirects);
  const reasons = new Set<string>();

  if (gtinRoots.unresolved || gtinRoots.roots.length > 1) {
    reasons.add("barcode_conflict");
    reasons.add("identity_conflict");
  }

  if (
    sourceRoots.roots.length > 0 &&
    gtinRoots.roots.length > 0 &&
    uniqueSorted([...sourceRoots.roots, ...gtinRoots.roots]).length > 1
  ) {
    reasons.add("barcode_conflict");
    reasons.add("identity_conflict");
  }

  const authoritativeRoots = uniqueSorted([
    ...sourceRoots.roots,
    ...gtinRoots.roots,
    ...semanticRoots.roots,
    ...aliasRoots.roots
  ]);
  if (
    authoritativeRoots.length > 1 ||
    sourceRoots.unresolved ||
    semanticRoots.unresolved ||
    aliasRoots.unresolved
  ) {
    reasons.add("identity_conflict");
  }

  return [...reasons].sort((left, right) => left.localeCompare(right));
}

function normalizedNameEvidence(candidate: FoodCatalogNormalizedCandidate): Set<string> {
  const values = [
    candidate.canonicalName.toLocaleLowerCase(),
    ...candidate.aliases.map((alias) => alias.normalizedValue),
    ...candidate.names.map((name) => name.normalizedValue)
  ];
  return new Set(values);
}

export function decideCanonicalMatch(input: DecideCanonicalMatchInput): FoodCatalogCanonicalDecision {
  const { candidate, index } = input;
  const sourceDecision = decideFromOwners(sourceOwnerFoodIds(input), index.redirects);
  if (sourceDecision !== null) return sourceDecision;

  const gtinDecision = decideFromOwners(gtinOwnerFoodIds(input), index.redirects);
  if (gtinDecision !== null) return gtinDecision;

  const semanticDecision = decideFromOwners(semanticOwnerFoodIds(input), index.redirects);
  if (semanticDecision !== null) return semanticDecision;

  const aliasDecision = decideFromOwners(qualifiedAliasOwnerFoodIds(input), index.redirects);
  if (aliasDecision !== null) return aliasDecision;

  const names = normalizedNameEvidence(candidate);
  const possibleDuplicateFoodIds = uniqueSorted(
    index.possibleDuplicateNames
      .filter((owner) => names.has(owner.normalizedName))
      .map((owner) => owner.foodId)
  );
  if (possibleDuplicateFoodIds.length > 0) {
    return { kind: "possible_duplicate", candidateFoodIds: possibleDuplicateFoodIds };
  }

  return { kind: "create" };
}
