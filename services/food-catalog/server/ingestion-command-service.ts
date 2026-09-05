import "server-only";

import { createHash } from "node:crypto";
import { buildSemanticBatchIdentity } from "@/lib/food-catalog/ingestion/engine";
import { checksumManifestContent, stableJson } from "@/lib/food-catalog/ingestion/manifest";
import type {
  FoodCatalogDryRunManifestCandidate,
  FoodCatalogDryRunManifestContent,
} from "@/lib/food-catalog/ingestion/contracts";
import type {
  ExecuteApprovedFoodCatalogDraftMutationInput,
  ExecuteApprovedFoodCatalogDraftMutationResult,
} from "./ingestion-contracts";
import type {
  FoodCatalogIngestionCommandResult,
  FoodCatalogIngestionCommandStore,
} from "./ingestion-store";

const SHA256 = /^[0-9a-f]{64}$/;

function deterministicUuid(...parts: readonly unknown[]): string {
  const bytes = createHash("sha256")
    .update(stableJson(parts))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requiredString(result: FoodCatalogIngestionCommandResult, field: string): string {
  const value = result[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Plan 4 ingestion command result ${field} must be a nonblank string.`);
  }
  return value;
}

function requiredPositiveInteger(result: FoodCatalogIngestionCommandResult, field: string): number {
  const value = result[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Plan 4 ingestion command result ${field} must be a positive integer.`);
  }
  return value;
}

function productionFoodId(
  entry: FoodCatalogDryRunManifestCandidate,
  semanticIdentityChecksumSha256: string,
): string | undefined {
  if (entry.disposition.kind !== "accept") return undefined;
  if (entry.decision.kind === "match") return entry.decision.foodId;
  if (entry.decision.kind === "create") {
    return deterministicUuid(
      "food-catalog-plan4-create-v2",
      semanticIdentityChecksumSha256,
      entry.candidate.sourceRecordId,
    );
  }
  return undefined;
}

function decisionCandidateFoodIds(entry: FoodCatalogDryRunManifestCandidate): string[] {
  return entry.decision.kind === "possible_duplicate"
    ? [...entry.decision.candidateFoodIds]
    : [];
}

function preparePayload(
  input: ExecuteApprovedFoodCatalogDraftMutationInput,
): Record<string, unknown> {
  return {
    executionMode: "production",
    attemptNumber: input.attemptNumber,
    manifestContentChecksumSha256: input.manifestContentChecksumSha256,
    semanticIdentityChecksumSha256: input.semanticIdentityChecksumSha256,
    source: input.manifestContent.source,
    expectedMutations: input.manifestContent.expectedMutations,
  };
}

function semanticOperationId(
  input: ExecuteApprovedFoodCatalogDraftMutationInput,
  command: string,
  sourceRecordId?: string,
): string {
  return deterministicUuid(
    "food-catalog-plan4-semantic-operation-v2",
    input.semanticIdentityChecksumSha256,
    input.manifestContentChecksumSha256,
    input.attemptNumber,
    command,
    sourceRecordId ?? null,
  );
}

function leaseOperationId(
  input: ExecuteApprovedFoodCatalogDraftMutationInput,
  command: string,
  discriminator?: string,
): string {
  return deterministicUuid(
    "food-catalog-plan4-lease-operation-v2",
    input.operationNamespace,
    input.semanticIdentityChecksumSha256,
    input.manifestContentChecksumSha256,
    input.attemptNumber,
    command,
    discriminator ?? null,
  );
}

function assertExactManifest(input: ExecuteApprovedFoodCatalogDraftMutationInput): void {
  if (!SHA256.test(input.manifestContentChecksumSha256)) {
    throw new Error("Plan 4 ingestion manifest checksum must be lowercase SHA-256 hex.");
  }
  if (!SHA256.test(input.semanticIdentityChecksumSha256)) {
    throw new Error("Plan 4 ingestion semantic identity checksum must be lowercase SHA-256 hex.");
  }
  const computedManifestChecksum = checksumManifestContent(input.manifestContent);
  if (computedManifestChecksum !== input.manifestContentChecksumSha256) {
    throw new Error("Plan 4 ingestion manifest checksum does not match the exact manifest content.");
  }
  const computedSemanticIdentity = buildSemanticBatchIdentity({
    source: input.manifestContent.source,
    manifestContentChecksumSha256: computedManifestChecksum,
    expectedMutations: input.manifestContent.expectedMutations,
  });
  if (computedSemanticIdentity !== input.semanticIdentityChecksumSha256) {
    throw new Error("Plan 4 ingestion semantic identity does not match the exact manifest content.");
  }
}

async function persistEntry(
  store: FoodCatalogIngestionCommandStore,
  input: ExecuteApprovedFoodCatalogDraftMutationInput,
  entry: FoodCatalogDryRunManifestCandidate,
  runId: string,
  leaseToken: string,
  leaseEpoch: number,
): Promise<void> {
  const sourceRecordId = entry.candidate.sourceRecordId;
  const foodId = productionFoodId(entry, input.semanticIdentityChecksumSha256);
  const persistPayload: Record<string, unknown> = {
    runId,
    leaseToken,
    leaseEpoch,
    decisionKind: entry.decision.kind,
    dispositionKind: entry.disposition.kind,
    decision: entry.decision,
    disposition: entry.disposition,
    issues: entry.issues,
    candidate: entry.candidate,
  };
  if (foodId) persistPayload.foodId = foodId;

  await store.persistCandidate(
    semanticOperationId(input, "persist-candidate", sourceRecordId),
    persistPayload,
  );

  if (entry.disposition.kind === "quarantine") {
    await store.recordQuarantine(
      semanticOperationId(input, "record-quarantine", sourceRecordId),
      {
        runId,
        leaseToken,
        leaseEpoch,
        sourceRecordId,
        decisionKind: entry.decision.kind,
        reasonCodes: entry.disposition.reasonCodes,
        candidateFoodIds: decisionCandidateFoodIds(entry),
        evidence: {
          issues: entry.issues,
          identityEvidence: entry.candidate.identityEvidence,
        },
      },
    );
  }
}

export async function executeApprovedFoodCatalogDraftMutation(
  store: FoodCatalogIngestionCommandStore,
  input: ExecuteApprovedFoodCatalogDraftMutationInput,
): Promise<ExecuteApprovedFoodCatalogDraftMutationResult> {
  assertExactManifest(input);
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new Error("Plan 4 ingestion attemptNumber must be a positive integer.");
  }
  if (!input.leaseOwner.trim()) throw new Error("Plan 4 ingestion leaseOwner is required.");
  if (!Number.isInteger(input.leaseSeconds) || input.leaseSeconds < 15 || input.leaseSeconds > 900) {
    throw new Error("Plan 4 ingestion leaseSeconds must be an integer between 15 and 900 seconds.");
  }
  if (!input.operationNamespace.trim()) throw new Error("Plan 4 ingestion operationNamespace is required.");

  const prepared = await store.prepareExecution(
    semanticOperationId(input, "prepare-execution"),
    preparePayload(input),
  );
  const batchId = requiredString(prepared, "batchId");
  const runId = requiredString(prepared, "runId");
  if (prepared.executionMode !== "production") {
    throw new Error("Plan 4 draft mutation requires a Production execution attempt.");
  }
  if (prepared.reviewState !== "approved") {
    throw new Error("Plan 4 draft mutation requires the exact approved ingestion manifest.");
  }

  const requestedLeaseToken = deterministicUuid(
    "food-catalog-plan4-lease-token-v2",
    input.operationNamespace,
    input.semanticIdentityChecksumSha256,
    input.manifestContentChecksumSha256,
    input.attemptNumber,
  );
  const lease = await store.acquireLease(
    leaseOperationId(input, "acquire-lease"),
    {
      runId,
      leaseOwner: input.leaseOwner,
      leaseToken: requestedLeaseToken,
      leaseSeconds: input.leaseSeconds,
    },
  );
  const activeLeaseToken = requiredString(lease, "leaseToken");
  const leaseEpoch = requiredPositiveInteger(lease, "leaseEpoch");

  for (const [index, entry] of input.manifestContent.candidates.entries()) {
    if (index > 0) {
      await store.heartbeatLease(
        leaseOperationId(input, "heartbeat-lease", entry.candidate.sourceRecordId),
        {
          runId,
          leaseToken: activeLeaseToken,
          leaseEpoch,
          leaseSeconds: input.leaseSeconds,
        },
      );
    }
    await persistEntry(store, input, entry, runId, activeLeaseToken, leaseEpoch);
  }

  const reconciliation = await store.recordReconciliation(
    semanticOperationId(input, "record-reconciliation"),
    {
      runId,
      leaseToken: activeLeaseToken,
      leaseEpoch,
      manifestContentChecksumSha256: input.manifestContentChecksumSha256,
      semanticIdentityChecksumSha256: input.semanticIdentityChecksumSha256,
      completed: true,
    },
  );
  const reconciliationId = requiredString(reconciliation, "reconciliationId");
  if (reconciliation.ok !== true) {
    const mismatchCodes = Array.isArray(reconciliation.mismatchCodes)
      ? reconciliation.mismatchCodes.map(String)
      : ["unknown"];
    await store.failRun(
      semanticOperationId(input, "fail-run"),
      {
        runId,
        leaseToken: activeLeaseToken,
        leaseEpoch,
        reconciliationId,
        mismatchCodes,
      },
    );
    throw new Error(`Plan 4 ingestion reconciliation failed closed: ${mismatchCodes.join(",")}.`);
  }

  const completed = await store.completeRun(
    semanticOperationId(input, "complete-run"),
    {
      runId,
      leaseToken: activeLeaseToken,
      leaseEpoch,
    },
  );

  return {
    batchId,
    runId,
    status: requiredString(completed, "status"),
    reconciliationId,
  };
}

export function manifestCandidateCount(content: FoodCatalogDryRunManifestContent): number {
  return content.candidates.length;
}
