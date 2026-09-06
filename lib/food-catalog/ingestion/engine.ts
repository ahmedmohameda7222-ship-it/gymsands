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

function sameManifestUnownedGtinConflicts(
  candidates: readonly EvaluatedCandidate[],
  index: FoodCatalogMatchIndex
): Set<string> {
  const indexedGtins = new Set(index.gtinOwners.map((owner) => owner.gtin));
  const firstSourceByGtin = new Map<string, string>();
  const conflicts = new Set<string>();

  for (const entry of candidates) {
    if (entry.errorIssueCodes.length > 0) continue;
    for (const gtin of entry.candidate.gtins) {
      if (indexedGtins.has(gtin)) continue;
      const firstSource = firstSourceByGtin.get(gtin);
      if (firstSource === undefined) {
        firstSourceByGtin.set(gtin, entry.candidate.sourceRecordId);
      } else if (firstSource !== entry.candidate.sourceRecordId) {
        conflicts.add(gtin);
      }
    }
  }

  return conflicts;
}

function deriveSameManifestConflictReasons(
  candidate: EvaluatedCandidate["candidate"],
  conflictingGtins: ReadonlySet<string>
): string[] {
  return candidate.gtins.some((gtin) => conflictingGtins.has(gtin))
    ? ["barcode_conflict", "identity_conflict"]
    : [];
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
  const conflictingManifestGtins = sameManifestUnownedGtinConflicts(evaluatedCandidates, index);

  const entries = evaluatedCandidates.map(({ candidate, issues, errorIssueCodes }) => {
    const matchInput = { source, candidate, index };
    const decision: FoodCatalogCanonicalDecision = errorIssueCodes.length > 0
      ? { kind: "reject", issueCodes: errorIssueCodes }
      : decideCanonicalMatch(matchInput);
    const conflictReasons = errorIssueCodes.length > 0
      ? []
      : uniqueSortedStrings([
          ...deriveCanonicalConflictReasons(matchInput),
          ...deriveSameManifestConflictReasons(candidate, conflictingManifestGtins)
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
