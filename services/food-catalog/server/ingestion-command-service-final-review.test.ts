import { describe, expect, it, vi } from "vitest";
import { buildSemanticBatchIdentity } from "@/lib/food-catalog/ingestion/engine";
import type { FoodCatalogDryRunManifestContent } from "@/lib/food-catalog/ingestion/contracts";
import { checksumManifestContent } from "@/lib/food-catalog/ingestion/manifest";
import { executeApprovedFoodCatalogDraftMutation } from "./ingestion-command-service";

const RUN_ID = "57000000-0000-4000-8000-000000000001";
const BATCH_ID = "57000000-0000-4000-8000-000000000002";
const LEASE_TOKEN = "57000000-0000-4000-8000-000000000003";

function emptyManifest(): FoodCatalogDryRunManifestContent {
  return {
    source: {
      provider: "synthetic-reference",
      dataset: "final-review-fixture",
      sourceVersion: "2026.09",
      sourceReleaseDate: "2026-09-04",
      licenseName: "Fixture License",
      licenseReference: null,
      sourceReference: "fixture://final-review",
      sourceChecksumSha256: "a".repeat(64),
      importerVersion: "plan4-final-review",
      configChecksumSha256: "b".repeat(64),
    },
    candidates: [],
    expectedMutations: {
      input: 0,
      accepted: 0,
      rejected: 0,
      matched: 0,
      created: 0,
      possibleDuplicate: 0,
      quarantined: 0,
    },
  };
}

function exactInput(content: FoodCatalogDryRunManifestContent) {
  const manifestContentChecksumSha256 = checksumManifestContent(content);
  const semanticIdentityChecksumSha256 = buildSemanticBatchIdentity({
    source: content.source,
    manifestContentChecksumSha256,
    expectedMutations: content.expectedMutations,
  });
  return {
    manifestContent: content,
    manifestContentChecksumSha256,
    semanticIdentityChecksumSha256,
    attemptNumber: 1,
    leaseOwner: "plan4-final-review",
    leaseSeconds: 120,
    operationNamespace: "plan4-final-review",
  };
}

function makeStore(reconciliationOk = true) {
  const calls: string[] = [];
  const command = (name: string, result: Record<string, unknown>) =>
    vi.fn(async () => {
      calls.push(name);
      return result;
    });

  return {
    calls,
    store: {
      prepareExecution: command("prepareExecution", {
        batchId: BATCH_ID,
        runId: RUN_ID,
        reviewState: "approved",
        executionMode: "production",
      }),
      acquireLease: command("acquireLease", {
        runId: RUN_ID,
        leaseToken: LEASE_TOKEN,
        leaseEpoch: 1,
        leaseExpiresAt: "2026-09-04T13:00:00.000Z",
      }),
      heartbeatLease: command("heartbeatLease", {}),
      persistCandidate: command("persistCandidate", {}),
      recordQuarantine: command("recordQuarantine", {}),
      resolveQuarantine: command("resolveQuarantine", {}),
      recordReconciliation: command("recordReconciliation", {
        reconciliationId: "57000000-0000-4000-8000-000000000004",
        ok: reconciliationOk,
        mismatchCodes: reconciliationOk ? [] : ["outcome_count_mismatch"],
      }),
      recordReleaseDiff: command("recordReleaseDiff", {}),
      appendEvent: command("appendEvent", {}),
      completeRun: command("completeRun", { runId: RUN_ID, status: "completed" }),
      failRun: command("failRun", { runId: RUN_ID, status: "failed" }),
    },
  };
}

describe("Food Catalog Plan 4 final independent-review server hardening", () => {
  it("recomputes semantic batch identity from the exact manifest before any command", async () => {
    const content = emptyManifest();
    const input = exactInput(content);
    const { store, calls } = makeStore();

    await expect(executeApprovedFoodCatalogDraftMutation(store, {
      ...input,
      semanticIdentityChecksumSha256: "f".repeat(64),
    })).rejects.toThrow(/semantic.*identity.*manifest/i);
    expect(calls).toEqual([]);
  });

  it("terminalizes a Production run through the narrow command boundary after failed reconciliation", async () => {
    const { store, calls } = makeStore(false);

    await expect(executeApprovedFoodCatalogDraftMutation(store, exactInput(emptyManifest())))
      .rejects.toThrow(/reconciliation failed closed/i);

    expect(calls).toEqual([
      "prepareExecution",
      "acquireLease",
      "recordReconciliation",
      "failRun",
    ]);
  });
});
