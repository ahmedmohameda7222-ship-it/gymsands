import { createHash } from "node:crypto";
import type {
  FoodCatalogDryRunManifestCandidate,
  FoodCatalogDryRunManifestContent,
  FoodCatalogDryRunManifestEnvelope
} from "./contracts";

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value === null || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue;
    canonical[key] = canonicalizeJson(record[key]);
  }
  return canonical;
}

function sortedUnique<T>(values: T[], keyOf: (value: T) => string): T[] {
  const sorted = [...values].sort((left, right) => keyOf(left).localeCompare(keyOf(right)));
  const seen = new Set<string>();
  return sorted.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalizeManifestCandidate(
  entry: FoodCatalogDryRunManifestCandidate
): FoodCatalogDryRunManifestCandidate {
  const decision = entry.decision.kind === "possible_duplicate"
    ? {
        ...entry.decision,
        candidateFoodIds: [...new Set(entry.decision.candidateFoodIds)].sort()
      }
    : entry.decision.kind === "reject"
      ? {
          ...entry.decision,
          issueCodes: [...new Set(entry.decision.issueCodes)].sort()
        }
      : entry.decision;

  return {
    candidate: {
      ...entry.candidate,
      aliases: sortedUnique(
        entry.candidate.aliases,
        (alias) => `${alias.locale}\u0000${alias.normalizedValue}\u0000${alias.value}`
      ),
      gtins: [...new Set(entry.candidate.gtins)].sort(),
      marketScopes: sortedUnique(
        entry.candidate.marketScopes,
        (scope) => `${scope.type}\u0000${scope.code}\u0000${scope.relevanceLevel}`
      )
    },
    issues: sortedUnique(
      entry.issues,
      (issue) => `${issue.code}\u0000${issue.severity}\u0000${issue.field ?? ""}`
    ),
    decision
  };
}

function canonicalizeManifestContent(
  content: FoodCatalogDryRunManifestContent
): FoodCatalogDryRunManifestContent {
  const candidates = content.candidates
    .map(canonicalizeManifestCandidate)
    .sort((left, right) => {
      const bySourceRecord = left.candidate.sourceRecordId.localeCompare(right.candidate.sourceRecordId);
      return bySourceRecord || stableJson(left).localeCompare(stableJson(right));
    });

  return {
    source: { ...content.source },
    candidates,
    expectedMutations: { ...content.expectedMutations }
  };
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function checksumManifestContent(content: FoodCatalogDryRunManifestContent): string {
  return createHash("sha256")
    .update(stableJson(canonicalizeManifestContent(content)))
    .digest("hex");
}

export function createDryRunManifestEnvelope(
  content: FoodCatalogDryRunManifestContent,
  metadata: Pick<FoodCatalogDryRunManifestEnvelope, "generatedAt" | "runId" | "diagnosticsLocation">
): FoodCatalogDryRunManifestEnvelope {
  return {
    content,
    manifestContentChecksumSha256: checksumManifestContent(content),
    ...metadata
  };
}
