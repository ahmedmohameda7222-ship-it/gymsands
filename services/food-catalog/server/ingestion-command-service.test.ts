import { describe, expect, it, vi } from "vitest";
import type { FoodCatalogDryRunManifestContent } from "@/lib/food-catalog/ingestion/contracts";
import { checksumManifestContent } from "@/lib/food-catalog/ingestion/manifest";
import { executeApprovedFoodCatalogDraftMutation } from "./ingestion-command-service";

const RUN_ID = "56000000-0000-4000-8000-000000000001";
const BATCH_ID = "56000000-0000-4000-8000-000000000002";
const LEASE_TOKEN = "56000000-0000-4000-8000-000000000003";
const MATCH_FOOD_ID = "56000000-0000-4000-8000-000000000004";
const SEMANTIC_CHECKSUM = "b".repeat(64);

function candidate(sourceRecordId: string) {
  return {
    sourceRecordId,
    sourceReference: `fixture://${sourceRecordId}`,
    sourceRecordChecksumSha256: "c".repeat(64),
    canonicalName: `Fixture ${sourceRecordId}`,
    brandName: null,
    servingLabel: "100 g",
    category: null,
    cuisine: null,
    nutrition: {
      calories: 100,
      protein_g: 10,
      carbs_g: 5,
      fat_g: 2,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 100,
      basis_unit: "g" as const,
    },
    aliases: [],
    names: [],
    identityEvidence: {
      semanticSignature: null,
      preparation: null,
      state: null,
      form: null,
      structuredEvidenceKey: null,
    },
    servings: [],
    taxonomyEvidence: [],
    gtins: [],
    marketScopes: [],
    globallyRelevant: true,
    sourceNutrition: { fixture: true },
    sourceServing: { label: "100 g" },
  };
}

function manifest(
  entry: FoodCatalogDryRunManifestContent["candidates"][number],
): FoodCatalogDryRunManifestContent {
  return {
    source: {
      provider: "synthetic-reference",
      dataset: "fixture-v2",
      sourceVersion: "2026.09",
      sourceReleaseDate: "2026-09-04",
      licenseName: "Fixture License",
      licenseReference: "fixture-license",
      sourceReference: "fixture://plan4",
      sourceChecksumSha256: "d".repeat(64),
      importerVersion: "plan4-test",
      configChecksumSha256: "e".repeat(64),
    },
    candidates: [entry],
    expectedMutations: {
      input: 1,
      accepted: entry.disposition.kind === "accept" ? 1 : 0,
      rejected: entry.disposition.kind === "reject" ? 1 : 0,
      matched: entry.disposition.kind === "accept" && entry.decision.kind === "match" ? 1 : 0,
      created: entry.disposition.kind === "accept" && entry.decision.kind === "create" ? 1 : 0,
      possibleDuplicate: entry.decision.kind === "possible_duplicate" ? 1 : 0,
      quarantined: entry.disposition.kind === "quarantine" ? 1 : 0,
    },
  };
}

function makeStore(reviewState = "approved") {
  const calls: Array<{ method: string; operationId: string; payload: Record<string, unknown> }> = [];
  const method = (
    name: string,
    result: Record<string, unknown>,
  ) => vi.fn(async (operationId: string, payload: Record<string, unknown>) => {
    calls.push({ method: name, operationId, payload });
    return result;
  });

  return {
    calls,
    store: {
      prepareExecution: method("prepareExecution", {
        batchId: BATCH_ID,
        runId: RUN_ID,
        reviewState,
        executionMode: "production",
      }),
      acquireLease: method("acquireLease", {
        runId: RUN_ID,
        leaseToken: LEASE_TOKEN,
        leaseEpoch: 1,
        leaseExpiresAt: "2026-09-04T13:00:00.000Z",
      }),
      heartbeatLease: method("heartbeatLease", {}),
      persistCandidate: method("persistCandidate", { runId: RUN_ID }),
      recordQuarantine: method("recordQuarantine", { quarantineId: "56000000-0000-4000-8000-000000000005" }),
      resolveQuarantine: method("resolveQuarantine", {}),
      recordReconciliation: method("recordReconciliation", {
        reconciliationId: "56000000-0000-4000-8000-000000000006",
        ok: true,
        mismatchCodes: [],
      }),
      recordReleaseDiff: method("recordReleaseDiff", {}),
      appendEvent: method("appendEvent", {}),
      completeRun: method("completeRun", { runId: RUN_ID, status: "completed" }),
    },
  };
}

const commonInput = {
  semanticIdentityChecksumSha256: SEMANTIC_CHECKSUM,
  attemptNumber: 1,
  leaseOwner: "plan4-executor",
  leaseSeconds: 120,
  operationNamespace: "plan4-fixture-execution",
};

function executionInput(content: FoodCatalogDryRunManifestContent) {
  return {
    ...commonInput,
    manifestContent: content,
    manifestContentChecksumSha256: checksumManifestContent(content),
  };
}

describe("Food Catalog Plan 4 draft-only ingestion executor", () => {
  it("rejects manifest content that does not match the approved checksum before any command", async () => {
    const { store, calls } = makeStore();
    const content = manifest({
      candidate: candidate("tampered-create"),
      issues: [],
      decision: { kind: "create" },
      disposition: { kind: "accept", reasonCodes: [] },
    });

    await expect(executeApprovedFoodCatalogDraftMutation(store, {
      ...executionInput(content),
      manifestContentChecksumSha256: "0".repeat(64),
    })).rejects.toThrow(/manifest.*checksum/i);
    expect(calls).toEqual([]);
  });

  it("requires the exact approved manifest before acquiring a Production lease", async () => {
    const { store, calls } = makeStore("reviewed");
    const content = manifest({
      candidate: candidate("create-1"),
      issues: [],
      decision: { kind: "create" },
      disposition: { kind: "accept", reasonCodes: [] },
    });

    await expect(executeApprovedFoodCatalogDraftMutation(store, executionInput(content))).rejects.toThrow(/approved/i);

    expect(calls.map((call) => call.method)).toEqual(["prepareExecution"]);
  });

  it("persists accepted CREATE with a deterministic canonical ID and reconciles before completion", async () => {
    const { store, calls } = makeStore();
    const content = manifest({
      candidate: candidate("create-1"),
      issues: [],
      decision: { kind: "create" },
      disposition: { kind: "accept", reasonCodes: [] },
    });

    await expect(executeApprovedFoodCatalogDraftMutation(store, executionInput(content)))
      .resolves.toMatchObject({ runId: RUN_ID, status: "completed" });

    expect(calls.map((call) => call.method)).toEqual([
      "prepareExecution",
      "acquireLease",
      "persistCandidate",
      "recordReconciliation",
      "completeRun",
    ]);
    const persist = calls.find((call) => call.method === "persistCandidate")!;
    expect(persist.payload).toMatchObject({
      runId: RUN_ID,
      leaseToken: LEASE_TOKEN,
      leaseEpoch: 1,
      decisionKind: "create",
      dispositionKind: "accept",
      candidate: expect.objectContaining({ sourceRecordId: "create-1" }),
      foodId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    });
    expect(calls.findIndex((call) => call.method === "recordReconciliation"))
      .toBeLessThan(calls.findIndex((call) => call.method === "completeRun"));
  });

  it("uses the matched canonical Food ID so provenance attaches to the resolved root", async () => {
    const { store, calls } = makeStore();
    const content = manifest({
      candidate: candidate("match-1"),
      issues: [],
      decision: { kind: "match", foodId: MATCH_FOOD_ID },
      disposition: { kind: "accept", reasonCodes: [] },
    });

    await executeApprovedFoodCatalogDraftMutation(store, executionInput(content));

    const persist = calls.find((call) => call.method === "persistCandidate")!;
    expect(persist.payload).toMatchObject({
      decisionKind: "match",
      dispositionKind: "accept",
      foodId: MATCH_FOOD_ID,
    });
  });

  it("records quarantine without converting it into an accepted canonical mutation", async () => {
    const { store, calls } = makeStore();
    const content = manifest({
      candidate: candidate("duplicate-1"),
      issues: [],
      decision: { kind: "possible_duplicate", candidateFoodIds: [MATCH_FOOD_ID] },
      disposition: { kind: "quarantine", reasonCodes: ["possible_duplicate"] },
    });

    await executeApprovedFoodCatalogDraftMutation(store, executionInput(content));

    expect(calls.map((call) => call.method)).toEqual([
      "prepareExecution",
      "acquireLease",
      "persistCandidate",
      "recordQuarantine",
      "recordReconciliation",
      "completeRun",
    ]);
    const persist = calls.find((call) => call.method === "persistCandidate")!;
    expect(persist.payload).toMatchObject({
      decisionKind: "possible_duplicate",
      dispositionKind: "quarantine",
    });
    expect(persist.payload).not.toHaveProperty("foodId");
  });

  it("derives identical operation IDs and CREATE IDs for an identical retry", async () => {
    const content = manifest({
      candidate: candidate("create-retry"),
      issues: [],
      decision: { kind: "create" },
      disposition: { kind: "accept", reasonCodes: [] },
    });
    const first = makeStore();
    const second = makeStore();

    await executeApprovedFoodCatalogDraftMutation(first.store, executionInput(content));
    await executeApprovedFoodCatalogDraftMutation(second.store, executionInput(content));

    expect(second.calls.map((call) => call.operationId)).toEqual(first.calls.map((call) => call.operationId));
    const firstPersist = first.calls.find((call) => call.method === "persistCandidate")!;
    const secondPersist = second.calls.find((call) => call.method === "persistCandidate")!;
    expect(secondPersist.payload.foodId).toBe(firstPersist.payload.foodId);
  });
});
