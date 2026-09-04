import "server-only";

import { createHash } from "node:crypto";
import { stableJson } from "@/lib/food-catalog/ingestion/manifest";
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

function commandOperationId(
  input: ExecuteApprovedFoodCatalogDraftMutationInput,
  command: string,
  sourceRecordId?: string,
): string {
  return deterministicUuid(
    "food-catalog-plan4-operation-v2",
    input.operationNamespace,
    input.semanticIdentityChecksumSha256,
    input.manifestContentChecksumSha256,
    input.attemptNumber,
    command,
    sourceRecordId ?? null,
  );
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
    candidate: entry.candidate,
  };
  if (foodId) persistPayload.foodId = foodId;

  await store.persistCandidate(
    commandOperationId(input, "persist-candidate", sourceRecordId),
    persistPayload,
  );

  if (entry.disposition.kind === "quarantine") {
    await store.recordQuarantine(
      commandOperationId(input, "record-quarantine", sourceRecordId),
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
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new Error("Plan 4 ingestion attemptNumber must be a positive integer.");
  }
  if (!input.leaseOwner.trim()) throw new Error("Plan 4 ingestion leaseOwner is required.");
  if (!Number.isInteger(input.leaseSeconds) || input.leaseSeconds < 1) {
    throw new Error("Plan 4 ingestion leaseSeconds must be a positive integer.");
  }
  if (!input.operationNamespace.trim()) throw new Error("Plan 4 ingestion operationNamespace is required.");

  const prepared = await store.prepareExecution(
    commandOperationId(input, "prepare-execution"),
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
    commandOperationId(input, "acquire-lease"),
    {
      runId,
      leaseOwner: input.leaseOwner,
      leaseToken: requestedLeaseToken,
      leaseSeconds: input.leaseSeconds,
    },
  );
  const activeLeaseToken = requiredString(lease, "leaseToken");
  const leaseEpoch = requiredPositiveInteger(lease, "leaseEpoch");

  for (const entry of input.manifestContent.candidates) {
    await persistEntry(store, input, entry, runId, activeLeaseToken, leaseEpoch);
  }

  const reconciliation = await store.recordReconciliation(
    commandOperationId(input, "record-reconciliation"),
    {
      runId,
      leaseToken: activeLeaseToken,
      leaseEpoch,
      manifestContentChecksumSha256: input.manifestContentChecksumSha256,
      semanticIdentityChecksumSha256: input.semanticIdentityChecksumSha256,
      completed: true,
    },
  );
  if (reconciliation.ok !== true) {
    const mismatchCodes = Array.isArray(reconciliation.mismatchCodes)
      ? reconciliation.mismatchCodes.join(",")
      : "unknown";
    throw new Error(`Plan 4 ingestion reconciliation failed closed: ${mismatchCodes}.`);
  }
  const reconciliationId = requiredString(reconciliation, "reconciliationId");

  const completed = await store.completeRun(
    commandOperationId(input, "complete-run"),
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
