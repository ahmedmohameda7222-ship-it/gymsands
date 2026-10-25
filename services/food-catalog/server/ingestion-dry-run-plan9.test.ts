import { describe, expect, it, vi } from "vitest";
import { buildSemanticBatchIdentity } from "@/lib/food-catalog/ingestion/engine";
import { checksumManifestContent } from "@/lib/food-catalog/ingestion/manifest";
import type { FoodCatalogDryRunManifestContent } from "@/lib/food-catalog/ingestion/contracts";
import { executeFoodCatalogDatabaseDryRun } from "./ingestion-command-service";

const ID = "10000000-0000-4000-8000-000000000001";
const ENTRY = {
  candidate: {
    sourceRecordId: "42", sourceReference: "source://42",
    sourceRecordChecksumSha256: "a".repeat(64), canonicalName: "Food 42",
    brandName: null, servingLabel: null, category: null, cuisine: null,
    nutrition: { calories: null, protein_g: 1, fat_g: 2, carbs_g: 3,
      fiber_g: null, saturated_fat_g: null, sugars_g: null, sodium_mg: null,
      basis_amount: 100, basis_unit: "g" as const },
    aliases: [], names: [], identityEvidence: {
      semanticSignature: "usda-test-42", preparation: null, state: null,
      form: null, structuredEvidenceKey: "USDA:NDB:42"
    }, servings: [], taxonomyEvidence: [], gtins: [], marketScopes: [],
    globallyRelevant: false, sourceNutrition: {}, sourceServing: {}
  },
  issues: [],
  decision: { kind: "create" as const },
  disposition: { kind: "accept" as const, reasonCodes: [] }
};
const manifest: FoodCatalogDryRunManifestContent = {
  source: {
    provider: "USDA_FDC", dataset: "FoundationFoods", sourceVersion: "2026-04-30",
    sourceReleaseDate: "2026-04-30", licenseName: "CC0 1.0",
    licenseReference: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceReference: "https://example.test/usda.zip",
    sourceChecksumSha256: "b".repeat(64),
    importerVersion: "plan8-1a0-v2", configChecksumSha256: "c".repeat(64)
  },
  candidates: [ENTRY],
  expectedMutations: { input: 1, accepted: 1, rejected: 0, matched: 0,
    created: 1, possibleDuplicate: 0, quarantined: 0 }
};
function payload() {
  const manifestContentChecksumSha256 = checksumManifestContent(manifest);
  return {
    manifestContent: manifest,
    manifestContentChecksumSha256,
    semanticIdentityChecksumSha256: buildSemanticBatchIdentity({
      source: manifest.source, manifestContentChecksumSha256,
      expectedMutations: manifest.expectedMutations
    }),
    attemptNumber: 1, leaseOwner: "unused",
    leaseSeconds: 120, operationNamespace: "dry-run-fixture"
  };
}
function store(mode = "dry_run", reconciled = true) {
  const calls: Array<{ name: string; id: string; body: Record<string, unknown> }> = [];
  const fn = (name: string, result: Record<string, unknown>) =>
    vi.fn(async (id: string, body: Record<string, unknown>) => {
      calls.push({ name, id, body }); return result;
    });
  return {
    calls,
    rpc: {
      prepareExecution: fn("prepareExecution", { batchId: ID, runId: ID,
        reviewState: "prepared", executionMode: mode }),
      persistCandidate: fn("persistCandidate", {}),
      recordQuarantine: fn("recordQuarantine", {}),
      recordReconciliation: fn("recordReconciliation", {
        reconciliationId: ID, ok: reconciled, mismatchCodes: reconciled ? [] : ["partial_execution"]
      }),
      completeRun: fn("completeRun", { status: "completed" }),
      failRun: fn("failRun", { status: "failed" }),
      acquireLease: fn("acquireLease", {}), heartbeatLease: fn("heartbeatLease", {}),
      resolveQuarantine: fn("resolveQuarantine", {}), recordReleaseDiff: fn("recordReleaseDiff", {})
    }
  };
}
describe("Plan 9 database-only review dry run command", () => {
  it("reconciles the original manifest without acquiring a Production lease or activating Foods", async () => {
    const s = store();
    await expect(executeFoodCatalogDatabaseDryRun(s.rpc, payload()))
      .resolves.toMatchObject({ batchId: ID, runId: ID, reconciliationId: ID, status: "completed" });
    expect(s.calls.map(x => x.name)).toEqual([
      "prepareExecution", "persistCandidate", "recordReconciliation", "completeRun"
    ]);
    expect(s.calls[0]?.body).toMatchObject({
      executionMode: "dry_run", manifestContentChecksumSha256: payload().manifestContentChecksumSha256
    });
    expect(s.calls[1]?.body).toMatchObject({
      decisionKind: "create", dispositionKind: "accept",
      foodId: expect.stringMatching(/^[0-9a-f-]{36}$/)
    });
    expect(s.rpc.acquireLease).not.toHaveBeenCalled();
  });

  it("refuses mismatched manifest before any persistent DB command", async () => {
    const s = store();
    await expect(executeFoodCatalogDatabaseDryRun(s.rpc, {
      ...payload(), semanticIdentityChecksumSha256: "0".repeat(64)
    })).rejects.toThrow(/semantic/i);
    expect(s.calls).toHaveLength(0);
  });

  it("fails closed if the stored attempt is actually Production", async () => {
    const s = store("production");
    await expect(executeFoodCatalogDatabaseDryRun(s.rpc, payload())).rejects.toThrow(/Production/i);
    expect(s.calls.map(x => x.name)).toEqual(["prepareExecution"]);
  });

  it("preserves failed reconciliation, never completes a failed run", async () => {
    const s = store("dry_run", false);
    await expect(executeFoodCatalogDatabaseDryRun(s.rpc, payload())).rejects.toThrow(/reconciliation failed/i);
    expect(s.calls.map(x => x.name)).toEqual([
      "prepareExecution", "persistCandidate", "recordReconciliation", "failRun"
    ]);
  });

  it("replays the same operation IDs deterministically and changes them on new attempt", async () => {
    const a = store(), b = store(), c = store();
    await executeFoodCatalogDatabaseDryRun(a.rpc, payload());
    await executeFoodCatalogDatabaseDryRun(b.rpc, payload());
    await executeFoodCatalogDatabaseDryRun(c.rpc, { ...payload(), attemptNumber: 2 });
    expect(b.calls.map(x => x.id)).toEqual(a.calls.map(x => x.id));
    expect(c.calls[0]?.id).not.toBe(a.calls[0]?.id);
  });
});
