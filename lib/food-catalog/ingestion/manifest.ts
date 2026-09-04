import { createHash } from "node:crypto";
import type {
  FoodCatalogCanonicalDecision,
  FoodCatalogDryRunManifestCandidate,
  FoodCatalogDryRunManifestContent,
  FoodCatalogDryRunManifestEnvelope,
  FoodCatalogNormalizedCandidate,
  FoodCatalogSourceDescriptor,
  FoodCatalogValidationIssue
} from "./contracts";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sortStable<T>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function canonicalizeDecision(decision: FoodCatalogCanonicalDecision): FoodCatalogCanonicalDecision {
  if (decision.kind !== "possible_duplicate") return decision;
  return {
    ...decision,
    candidateFoodIds: [...new Set(decision.candidateFoodIds)].sort((left, right) => left.localeCompare(right))
  };
}

function canonicalizeIssues(issues: FoodCatalogValidationIssue[]): FoodCatalogValidationIssue[] {
  return sortStable(issues);
}

function canonicalizeCandidate(candidate: FoodCatalogNormalizedCandidate): FoodCatalogNormalizedCandidate {
  return {
    ...candidate,
    aliases: sortStable(candidate.aliases),
    names: sortStable(candidate.names),
    servings: sortStable(candidate.servings),
    taxonomyEvidence: sortStable(candidate.taxonomyEvidence),
    gtins: [...new Set(candidate.gtins)].sort((left, right) => left.localeCompare(right)),
    marketScopes: sortStable(candidate.marketScopes)
  };
}

function canonicalizeManifestCandidate(
  entry: FoodCatalogDryRunManifestCandidate
): FoodCatalogDryRunManifestCandidate {
  return {
    candidate: canonicalizeCandidate(entry.candidate),
    issues: canonicalizeIssues(entry.issues),
    decision: canonicalizeDecision(entry.decision)
  };
}

function canonicalizeManifestContent(
  content: FoodCatalogDryRunManifestContent
): FoodCatalogDryRunManifestContent {
  return {
    source: content.source,
    candidates: content.candidates
      .map(canonicalizeManifestCandidate)
      .sort((left, right) => {
        const bySourceId = left.candidate.sourceRecordId.localeCompare(right.candidate.sourceRecordId);
        return bySourceId !== 0 ? bySourceId : stableJson(left).localeCompare(stableJson(right));
      }),
    expectedMutations: content.expectedMutations
  };
}

export function checksumManifestContent(content: FoodCatalogDryRunManifestContent): string {
  return createHash("sha256")
    .update(stableJson(canonicalizeManifestContent(content)))
    .digest("hex");
}

/**
 * Task-1 semantic-content builder for deterministic adapter/normalization
 * verification. The full Plan 4 engine later replaces the provisional CREATE
 * decisions with validated matching decisions before Production authority.
 */
export function buildPlan4ManifestContent(
  source: FoodCatalogSourceDescriptor,
  candidates: readonly FoodCatalogNormalizedCandidate[]
): FoodCatalogDryRunManifestContent {
  const entries = candidates.map((candidate): FoodCatalogDryRunManifestCandidate => ({
    candidate,
    issues: [],
    decision: { kind: "create" }
  }));

  return canonicalizeManifestContent({
    source,
    candidates: entries,
    expectedMutations: {
      input: entries.length,
      accepted: entries.length,
      rejected: 0,
      matched: 0,
      created: entries.length,
      possibleDuplicate: 0
    }
  });
}

export function createDryRunManifestEnvelope(
  content: FoodCatalogDryRunManifestContent,
  metadata: Pick<FoodCatalogDryRunManifestEnvelope, "generatedAt" | "runId" | "diagnosticsLocation">
): FoodCatalogDryRunManifestEnvelope {
  return {
    content: canonicalizeManifestContent(content),
    manifestContentChecksumSha256: checksumManifestContent(content),
    ...metadata
  };
}
