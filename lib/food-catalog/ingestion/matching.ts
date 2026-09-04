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

function decideFromOwners(
  ownerFoodIds: readonly string[],
  redirects: readonly FoodCatalogRedirect[]
): FoodCatalogCanonicalDecision | null {
  const owners = uniqueSorted(ownerFoodIds);
  if (owners.length === 0) return null;

  let unresolvedRedirect = false;
  const resolved = owners.map((foodId) => {
    const root = resolveRedirectRoot(foodId, redirects);
    if (root === null) {
      unresolvedRedirect = true;
      return foodId;
    }
    return root;
  });
  const candidateFoodIds = uniqueSorted(resolved);

  if (!unresolvedRedirect && candidateFoodIds.length === 1) {
    return { kind: "match", foodId: candidateFoodIds[0]! };
  }
  return { kind: "possible_duplicate", candidateFoodIds };
}

function normalizedNameEvidence(candidate: FoodCatalogNormalizedCandidate): Set<string> {
  const values = [
    candidate.canonicalName.toLocaleLowerCase(),
    ...candidate.aliases.map((alias) => alias.normalizedValue),
    ...candidate.names.map((name) => name.normalizedValue)
  ];
  return new Set(values);
}

export function decideCanonicalMatch({
  source,
  candidate,
  index
}: DecideCanonicalMatchInput): FoodCatalogCanonicalDecision {
  const sourceDecision = decideFromOwners(
    index.sourceIdentities
      .filter((identity) =>
        identity.provider === source.provider &&
        identity.dataset === source.dataset &&
        identity.sourceVersion === source.sourceVersion &&
        identity.sourceRecordId === candidate.sourceRecordId
      )
      .map((identity) => identity.foodId),
    index.redirects
  );
  if (sourceDecision !== null) return sourceDecision;

  const candidateGtins = new Set(candidate.gtins);
  const gtinDecision = decideFromOwners(
    index.gtinOwners
      .filter((owner) => candidateGtins.has(owner.gtin))
      .map((owner) => owner.foodId),
    index.redirects
  );
  if (gtinDecision !== null) return gtinDecision;

  if (candidate.identityEvidence.semanticSignature !== null) {
    const semanticDecision = decideFromOwners(
      index.semanticIdentities
        .filter((identity) =>
          identity.semanticSignature === candidate.identityEvidence.semanticSignature
        )
        .map((identity) => identity.foodId),
      index.redirects
    );
    if (semanticDecision !== null) return semanticDecision;
  }

  const { state, preparation, form } = candidate.identityEvidence;
  if (state !== null && preparation !== null && form !== null) {
    const aliases = new Set(candidate.aliases.map((alias) => alias.normalizedValue));
    const aliasDecision = decideFromOwners(
      index.qualifiedAliases
        .filter((owner) =>
          aliases.has(owner.normalizedAlias) &&
          owner.state === state &&
          owner.preparation === preparation &&
          owner.form === form
        )
        .map((owner) => owner.foodId),
      index.redirects
    );
    if (aliasDecision !== null) return aliasDecision;
  }

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
