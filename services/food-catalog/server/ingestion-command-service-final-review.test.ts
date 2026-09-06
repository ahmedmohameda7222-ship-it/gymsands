import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildSemanticBatchIdentity } from "@/lib/food-catalog/ingestion/engine";
import type {
  FoodCatalogCandidateInput,
  FoodCatalogDryRunManifestContent,
} from "@/lib/food-catalog/ingestion/contracts";
import { checksumManifestContent } from "@/lib/food-catalog/ingestion/manifest";
import { normalizeFoodCatalogCandidate } from "@/lib/food-catalog/ingestion/normalize";
import { validateFoodCatalogCandidate } from "@/lib/food-catalog/ingestion/validate";
import { executeApprovedFoodCatalogDraftMutation } from "./ingestion-command-service";

const RUN_ID = "57000000-0000-4000-8000-000000000001";
const BATCH_ID = "57000000-0000-4000-8000-000000000002";
const LEASE_TOKEN = "57000000-0000-4000-8000-000000000003";
const MIGRATION = readFileSync(
  "supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql",
  "utf8",
);

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

function candidateInput(
  overrides: Partial<FoodCatalogCandidateInput> = {},
): FoodCatalogCandidateInput {
  return {
    sourceRecordId: "final-review-source",
    sourceReference: "fixture://final-review-source",
    sourceRecordChecksumSha256: null,
    canonicalName: "Final Review Food",
    brandName: null,
    servingLabel: null,
    category: null,
    cuisine: null,
    nutrition: {
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: null,
      basis_unit: null,
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
    globallyRelevant: false,
    sourceNutrition: {},
    sourceServing: null,
    ...overrides,
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

describe("Food Catalog Plan 4 final independent-review hardening", () => {
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

  it("canonicalizes representable serving units before reviewed materialization", () => {
    const normalized = normalizeFoodCatalogCandidate(candidateInput({
      servings: [{
        servingKey: "source-100g",
        label: "100 G",
        amount: 100,
        unit: " G ",
        gramWeight: null,
        milliliterVolume: null,
        sourceEvidence: { source: "fixture" },
      }],
    }));

    expect(normalized.servings[0]?.unit).toBe("g");
    expect(validateFoodCatalogCandidate(normalized)).toEqual([]);
  });

  it("rejects syntactically valid market scopes that are absent from the controlled Plan 1 registry", () => {
    const normalized = normalizeFoodCatalogCandidate(candidateInput({
      marketScopes: [{ type: "country", code: "FR", relevanceLevel: "primary" }],
    }));

    expect(validateFoodCatalogCandidate(normalized).map((issue) => issue.code))
      .toContain("invalid_market_scope");
  });

  it("compares every immutable source snapshot field before reusing a versioned source record", () => {
    for (const evidence of [
      "v_source_record.source_reference is distinct from nullif(v_candidate->>'sourceReference', '')",
      "v_source_record.license_name is distinct from v_batch.license_name",
      "v_source_record.license_reference is distinct from v_batch.license_reference",
      "v_source_record.source_nutrition is distinct from v_candidate->'sourceNutrition'",
      "v_source_record.source_serving is distinct from v_candidate->'sourceServing'",
      "v_source_record.source_release_date is distinct from v_batch.source_release_date",
    ]) {
      expect(MIGRATION).toContain(evidence);
    }
  });

  it("uses batch then run lock order for candidate persistence just like lease acquisition", () => {
    const start = MIGRATION.indexOf(
      "create or replace function public.food_catalog_ingestion_persist_candidate_v2",
    );
    const end = MIGRATION.indexOf(
      "create or replace function public.food_catalog_ingestion_record_quarantine_v2",
      start,
    );
    const persistenceFunction = MIGRATION.slice(start, end);
    const batchLock = persistenceFunction.indexOf(
      "from public.food_ingestion_batches where id = v_batch_id for update",
    );
    const runLock = persistenceFunction.indexOf(
      "select * into v_run from public.food_ingestion_runs where id = v_run_id for update",
    );

    expect(batchLock).toBeGreaterThanOrEqual(0);
    expect(runLock).toBeGreaterThanOrEqual(0);
    expect(batchLock).toBeLessThan(runLock);
  });
});