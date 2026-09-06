import { createHash } from "node:crypto";
import type { FoodCatalogSourceAdapter } from "./adapter";
import type {
  FoodCatalogCanonicalDecision,
  FoodCatalogDryRunManifestContent,
  FoodCatalogExpectedMutationCounts,
  FoodCatalogSourceDescriptor,
  FoodCatalogValidationIssue,
  FoodCatalogValidationIssueCode
} from "./contracts";
import {
  canonicalizeManifestContent,
  checksumManifestContent,
  stableJson
} from "./manifest";
import {
  decideCanonicalMatch,
  deriveCanonicalConflictReasons,
  type FoodCatalogMatchIndex
} from "./matching";
import {
  normalizeFoodCatalogCandidate,
  normalizeFoodCatalogSourceDescriptor
} from "./normalize";
import { deriveProcessingDisposition } from "./quarantine";
import { validateFoodCatalogCandidate } from "./validate";

export type BuildSemanticBatchIdentityInput = {
  source: FoodCatalogSourceDescriptor;
  manifestContentChecksumSha256: string;
  expectedMutations: FoodCatalogExpectedMutationCounts;
};

export type FoodCatalogDryRunResult = {
  manifestContent: FoodCatalogDryRunManifestContent;
  manifestContentChecksumSha256: string;
  semanticBatchIdentityChecksumSha256: string;
};

type EvaluatedCandidate = {
  candidate: ReturnType<typeof normalizeFoodCatalogCandidate>;
  issues: FoodCatalogValidationIssue[];
  errorIssueCodes: FoodCatalogValidationIssueCode[];
};

type SameManifestStrongConflicts = {
  gtins: Set<string>;
  semanticSignatures: Set<string>;
  qualifiedAliases: Set<string>;
};

function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueSortedIssueCodes(
  values: readonly FoodCatalogValidationIssueCode[]
): FoodCatalogValidationIssueCode[] {
  return uniqueSortedStrings(values) as FoodCatalogValidationIssueCode[];
}

export function buildSemanticBatchIdentity({
  source,
  manifestContentChecksumSha256,
  expectedMutations
}: BuildSemanticBatchIdentityInput): string {
  return createHash("sha256")
    .update(stableJson({
      schemaVersion: "food-catalog-semantic-batch-v2",
      source: normalizeFoodCatalogSourceDescriptor(source),
      manifestContentChecksumSha256,
      expectedMutations
    }))
    .digest("hex");
}

function countExpectedMutations(
  entries: FoodCatalogDryRunManifestContent["candidates"]
): FoodCatalogExpectedMutationCounts {
  return {
    input: entries.length,
    accepted: entries.filter((entry) => entry.disposition.kind === "accept").length,
    rejected: entries.filter((entry) => entry.disposition.kind === "reject").length,
    matched: entries.filter(
      (entry) => entry.disposition.kind === "accept" && entry.decision.kind === "match"
    ).length,
    created: entries.filter(
      (entry) => entry.disposition.kind === "accept" && entry.decision.kind === "create"
    ).length,
    possibleDuplicate: entries.filter((entry) => entry.decision.kind === "possible_duplicate").length,
    quarantined: entries.filter((entry) => entry.disposition.kind === "quarantine").length
  };
}

function assertUniqueNormalizedSourceIdentities(
  candidates: ReturnType<typeof normalizeFoodCatalogCandidate>[]
): void {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.sourceRecordId) {
      throw new Error("Normalized source identity cannot be blank in a persistable ingestion artifact.");
    }
    if (seen.has(candidate.sourceRecordId)) {
      throw new Error(`Duplicate normalized source identity: ${candidate.sourceRecordId}.`);
    }
    seen.add(candidate.sourceRecordId);
  }
}

function collectUnownedSameManifestCollisions(
  candidates: readonly EvaluatedCandidate[],
  indexedKeys: ReadonlySet<string>,
  keysForCandidate: (candidate: EvaluatedCandidate["candidate"]) => readonly string[]
): Set<string> {
  const firstSourceByKey = new Map<string, string>();
  const conflicts = new Set<string>();

  for (const entry of candidates) {
    if (entry.errorIssueCodes.length > 0) continue;
    for (const key of keysForCandidate(entry.candidate)) {
      if (indexedKeys.has(key)) continue;
      const firstSource = firstSourceByKey.get(key);
      if (firstSource === undefined) {
        firstSourceByKey.set(key, entry.candidate.sourceRecordId);
      } else if (firstSource !== entry.candidate.sourceRecordId) {
        conflicts.add(key);
      }
    }
  }

  return conflicts;
}

function qualifiedAliasKey(
  normalizedAlias: string,
  state: string,
  preparation: string,
  form: string
): string {
  return `${normalizedAlias}\u0000${state}\u0000${preparation}\u0000${form}`;
}

function candidateQualifiedAliasKeys(candidate: EvaluatedCandidate["candidate"]): string[] {
  const { state, preparation, form } = candidate.identityEvidence;
  if (!state || !preparation || !form) return [];
  return candidate.aliases.map((alias) =>
    qualifiedAliasKey(alias.normalizedValue, state, preparation, form)
  );
}

function sameManifestUnownedStrongConflicts(
  candidates: readonly EvaluatedCandidate[],
  index: FoodCatalogMatchIndex
): SameManifestStrongConflicts {
  const indexedGtins = new Set(index.gtinOwners.map((owner) => owner.gtin));
  const indexedSemanticSignatures = new Set(
    index.semanticIdentities.map((entry) => entry.semanticSignature)
  );
  const indexedQualifiedAliases = new Set(
    index.qualifiedAliases.map((entry) =>
      qualifiedAliasKey(entry.normalizedAlias, entry.state, entry.preparation, entry.form)
    )
  );

  return {
    gtins: collectUnownedSameManifestCollisions(
      candidates,
      indexedGtins,
      (candidate) => candidate.gtins
    ),
    semanticSignatures: collectUnownedSameManifestCollisions(
      candidates,
      indexedSemanticSignatures,
      (candidate) => candidate.identityEvidence.semanticSignature
        ? [candidate.identityEvidence.semanticSignature]
        : []
    ),
    qualifiedAliases: collectUnownedSameManifestCollisions(
      candidates,
      indexedQualifiedAliases,
      candidateQualifiedAliasKeys
    )
  };
}

function deriveSameManifestConflictReasons(
  candidate: EvaluatedCandidate["candidate"],
  conflicts: SameManifestStrongConflicts
): string[] {
  const reasons: string[] = [];
  if (candidate.gtins.some((gtin) => conflicts.gtins.has(gtin))) {
    reasons.push("barcode_conflict", "identity_conflict");
  }
  if (
    (candidate.identityEvidence.semanticSignature !== null
      && conflicts.semanticSignatures.has(candidate.identityEvidence.semanticSignature))
    || candidateQualifiedAliasKeys(candidate).some((key) => conflicts.qualifiedAliases.has(key))
  ) {
    reasons.push("identity_conflict");
  }
  return uniqueSortedStrings(reasons);
}

export function buildFoodCatalogDryRun<TArtifact>(
  adapter: FoodCatalogSourceAdapter<TArtifact>,
  artifact: TArtifact,
  index: FoodCatalogMatchIndex
): FoodCatalogDryRunResult {
  const source = adapter.describeSource(artifact);
  const normalizedCandidates = adapter.toCandidates(artifact)
    .map((candidateInput) => normalizeFoodCatalogCandidate(candidateInput));
  assertUniqueNormalizedSourceIdentities(normalizedCandidates);

  const evaluatedCandidates: EvaluatedCandidate[] = normalizedCandidates.map((candidate) => {
    const issues = validateFoodCatalogCandidate(candidate);
    const errorIssueCodes = uniqueSortedIssueCodes(
      issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.code)
    );
    return { candidate, issues, errorIssueCodes };
  });
  const sameManifestConflicts = sameManifestUnownedStrongConflicts(evaluatedCandidates, index);

  const entries = evaluatedCandidates.map(({ candidate, issues, errorIssueCodes }) => {
    const matchInput = { source, candidate, index };
    const decision: FoodCatalogCanonicalDecision = errorIssueCodes.length > 0
      ? { kind: "reject", issueCodes: errorIssueCodes }
      : decideCanonicalMatch(matchInput);
    const conflictReasons = errorIssueCodes.length > 0
      ? []
      : uniqueSortedStrings([
          ...deriveCanonicalConflictReasons(matchInput),
          ...deriveSameManifestConflictReasons(candidate, sameManifestConflicts)
        ]);
    const disposition = deriveProcessingDisposition({
      decision,
      issues,
      conflictReasons
    });
    return { candidate, issues, decision, disposition };
  });

  const manifestContent = canonicalizeManifestContent({
    source,
    candidates: entries,
    expectedMutations: countExpectedMutations(entries)
  });
  const manifestContentChecksumSha256 = checksumManifestContent(manifestContent);
  const semanticBatchIdentityChecksumSha256 = buildSemanticBatchIdentity({
    source: manifestContent.source,
    manifestContentChecksumSha256,
    expectedMutations: manifestContent.expectedMutations
  });

  return {
    manifestContent,
    manifestContentChecksumSha256,
    semanticBatchIdentityChecksumSha256
  };
}
