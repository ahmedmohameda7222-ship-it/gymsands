import type {
  FoodCatalogCanonicalDecision,
  FoodCatalogExpectedMutationCounts,
  FoodCatalogProcessingDisposition
} from "./contracts";

export type FoodCatalogObservedExecutionResult = {
  sourceRecordId: string;
  decisionKind: FoodCatalogCanonicalDecision["kind"];
  dispositionKind: FoodCatalogProcessingDisposition["kind"];
  idempotencyKey: string;
};

export type FoodCatalogExecutionReconciliationInput = {
  expected: {
    manifestContentChecksumSha256: string;
    semanticBatchIdentityChecksumSha256: string;
    sourceRecordIds: string[];
    quarantinedSourceRecordIds: string[];
    expectedMutations: FoodCatalogExpectedMutationCounts;
  };
  observed: {
    manifestContentChecksumSha256: string;
    semanticBatchIdentityChecksumSha256: string;
    completed: boolean;
    results: FoodCatalogObservedExecutionResult[];
  };
};

export type FoodCatalogReconciliationIssueCode =
  | "manifest_checksum_mismatch"
  | "missing_result"
  | "extra_result"
  | "duplicate_result"
  | "idempotency_mismatch"
  | "partial_execution"
  | "quarantine_divergence"
  | "count_mismatch";

export type FoodCatalogExecutionReconciliationReport = {
  ok: boolean;
  issueCodes: FoodCatalogReconciliationIssueCode[];
};

const ISSUE_ORDER: readonly FoodCatalogReconciliationIssueCode[] = [
  "manifest_checksum_mismatch",
  "missing_result",
  "extra_result",
  "duplicate_result",
  "idempotency_mismatch",
  "partial_execution",
  "quarantine_divergence",
  "count_mismatch"
];

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function equalStringSets(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function observedCounts(
  results: readonly FoodCatalogObservedExecutionResult[]
): FoodCatalogExpectedMutationCounts {
  return {
    input: results.length,
    accepted: results.filter((result) => result.dispositionKind === "accept").length,
    rejected: results.filter((result) => result.dispositionKind === "reject").length,
    matched: results.filter(
      (result) => result.dispositionKind === "accept" && result.decisionKind === "match"
    ).length,
    created: results.filter(
      (result) => result.dispositionKind === "accept" && result.decisionKind === "create"
    ).length,
    possibleDuplicate: results.filter((result) => result.decisionKind === "possible_duplicate").length,
    quarantined: results.filter((result) => result.dispositionKind === "quarantine").length
  };
}

function sameCounts(
  left: FoodCatalogExpectedMutationCounts,
  right: FoodCatalogExpectedMutationCounts
): boolean {
  return Object.keys(left).every((key) =>
    left[key as keyof FoodCatalogExpectedMutationCounts]
      === right[key as keyof FoodCatalogExpectedMutationCounts]
  );
}

export function reconcileFoodCatalogExecution({
  expected,
  observed
}: FoodCatalogExecutionReconciliationInput): FoodCatalogExecutionReconciliationReport {
  const issues = new Set<FoodCatalogReconciliationIssueCode>();
  if (expected.manifestContentChecksumSha256 !== observed.manifestContentChecksumSha256) {
    issues.add("manifest_checksum_mismatch");
  }

  const expectedIds = sortedUnique(expected.sourceRecordIds);
  const observedIds = observed.results.map((result) => result.sourceRecordId);
  const observedIdSet = new Set(observedIds);
  const expectedIdSet = new Set(expectedIds);
  if (expectedIds.some((sourceRecordId) => !observedIdSet.has(sourceRecordId))) {
    issues.add("missing_result");
  }
  if (observedIds.some((sourceRecordId) => !expectedIdSet.has(sourceRecordId))) {
    issues.add("extra_result");
  }

  const resultsBySource = new Map<string, FoodCatalogObservedExecutionResult[]>();
  for (const result of observed.results) {
    const group = resultsBySource.get(result.sourceRecordId) ?? [];
    group.push(result);
    resultsBySource.set(result.sourceRecordId, group);
  }
  if ([...resultsBySource.values()].some((group) => group.length > 1)) {
    issues.add("duplicate_result");
  }

  const changedDuplicateIdempotency = [...resultsBySource.values()].some((group) =>
    group.length > 1 && new Set(group.map((result) => result.idempotencyKey)).size > 1
  );
  const idempotencyOwners = new Map<string, Set<string>>();
  for (const result of observed.results) {
    const owners = idempotencyOwners.get(result.idempotencyKey) ?? new Set<string>();
    owners.add(result.sourceRecordId);
    idempotencyOwners.set(result.idempotencyKey, owners);
  }
  const reusedAcrossRecords = [...idempotencyOwners.values()].some((owners) => owners.size > 1);
  if (
    expected.semanticBatchIdentityChecksumSha256 !== observed.semanticBatchIdentityChecksumSha256
    || changedDuplicateIdempotency
    || reusedAcrossRecords
  ) {
    issues.add("idempotency_mismatch");
  }

  if (!observed.completed) issues.add("partial_execution");

  const observedQuarantined = observed.results
    .filter((result) => result.dispositionKind === "quarantine")
    .map((result) => result.sourceRecordId);
  if (!equalStringSets(expected.quarantinedSourceRecordIds, observedQuarantined)) {
    issues.add("quarantine_divergence");
  }

  if (!sameCounts(expected.expectedMutations, observedCounts(observed.results))) {
    issues.add("count_mismatch");
  }

  const issueCodes = ISSUE_ORDER.filter((issue) => issues.has(issue));
  return { ok: issueCodes.length === 0, issueCodes };
}
