import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  FoodCatalogCandidateInput,
  FoodCatalogDryRunManifestContent,
  FoodCatalogSourceDescriptor,
} from "@/lib/food-catalog/ingestion/contracts";
import {
  buildFoodCatalogDryRun,
  buildSemanticBatchIdentity,
} from "@/lib/food-catalog/ingestion/engine";
import { checksumManifestContent } from "@/lib/food-catalog/ingestion/manifest";
import type { FoodCatalogMatchIndex } from "@/lib/food-catalog/ingestion/matching";
import { diffFoodCatalogReleases } from "@/lib/food-catalog/ingestion/release-diff";
import { createSyntheticFoodCatalogAdapter } from "@/lib/food-catalog/ingestion/synthetic-adapter";
import { executeApprovedFoodCatalogDraftMutation } from "./ingestion-command-service";
import type { FoodCatalogIngestionCommandStore } from "./ingestion-store";

const source = (): FoodCatalogSourceDescriptor => ({
  provider: "synthetic-reference",
  dataset: "second-final-review",
  sourceVersion: "2026.09",
  sourceReleaseDate: "2026-09-05",
  licenseName: "Fixture License",
  licenseReference: null,
  sourceReference: "fixture://second-final-review",
  sourceChecksumSha256: "a".repeat(64),
  importerVersion: "plan4-second-final-review",
  configChecksumSha256: "b".repeat(64),
});

const candidate = (
  sourceRecordId: string,
  overrides: Partial<FoodCatalogCandidateInput> = {},
): FoodCatalogCandidateInput => ({
  sourceRecordId,
  sourceReference: `fixture://${sourceRecordId || "blank"}`,
  sourceRecordChecksumSha256: null,
  canonicalName: "Second Final Review Fixture",
  brandName: null,
  servingLabel: null,
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
    basis_unit: "g",
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
  sourceNutrition: { protein: 10 },
  sourceServing: null,
  ...overrides,
});

const emptyIndex = (): FoodCatalogMatchIndex => ({
  sourceIdentities: [],
  gtinOwners: [],
  redirects: [],
  semanticIdentities: [],
  qualifiedAliases: [],
  possibleDuplicateNames: [],
});

function exactExecutionInput(content: FoodCatalogDryRunManifestContent, leaseSeconds: number) {
  const manifestContentChecksumSha256 = checksumManifestContent(content);
  return {
    manifestContent: content,
    manifestContentChecksumSha256,
    semanticIdentityChecksumSha256: buildSemanticBatchIdentity({
      source: content.source,
      manifestContentChecksumSha256,
      expectedMutations: content.expectedMutations,
    }),
    attemptNumber: 1,
    leaseOwner: "second-final-review",
    leaseSeconds,
    operationNamespace: "second-final-review",
  };
}

function noCommandStore(): FoodCatalogIngestionCommandStore {
  const unexpected = vi.fn(async () => {
    throw new Error("No command should be issued for invalid preflight input.");
  });
  return {
    prepareExecution: unexpected,
    acquireLease: unexpected,
    heartbeatLease: unexpected,
    persistCandidate: unexpected,
    recordQuarantine: unexpected,
    resolveQuarantine: unexpected,
    recordReconciliation: unexpected,
    recordReleaseDiff: unexpected,
    completeRun: unexpected,
    failRun: unexpected,
  };
}

describe("Food Catalog Plan 4 second final independent-review hardening", () => {
  it("fails the artifact before producing a persistable manifest when a normalized source ID is blank", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    expect(() => buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [candidate("   ")],
    }, emptyIndex())).toThrow(/blank.*source.*identity|source.*identity.*blank/i);
  });

  it("rejects taxonomy mappings absent from the controlled Plan 1 registry during dry run", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const result = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [candidate("taxonomy-unknown", {
        taxonomyEvidence: [{
          taxonomy: "primary_food_group",
          sourceCode: "provider-unknown",
          mappedTaxonomyId: "not-real",
        }],
      })],
    }, emptyIndex());

    expect(result.manifestContent.candidates[0]?.decision.kind).toBe("reject");
    expect(result.manifestContent.candidates[0]?.issues.map((issue) => issue.code))
      .toContain("invalid_taxonomy_mapping");
  });

  it("classifies a raw sourceNutrition change even when normalized nutrition and nullable source checksum are unchanged", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const previous = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [candidate("raw-nutrition", { sourceNutrition: { protein: 10, providerExtra: 1 } })],
    }, emptyIndex());
    const next = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [candidate("raw-nutrition", { sourceNutrition: { protein: 10, providerExtra: 2 } })],
    }, emptyIndex());
    const previousEntry = previous.manifestContent.candidates[0]!;
    const nextEntry = next.manifestContent.candidates[0]!;

    const report = diffFoodCatalogReleases({
      previousBatchIdentity: previous.semanticBatchIdentityChecksumSha256,
      nextBatchIdentity: next.semanticBatchIdentityChecksumSha256,
      previousRecords: [{
        sourceRecordId: previousEntry.candidate.sourceRecordId,
        candidate: previousEntry.candidate,
        decision: previousEntry.decision,
        disposition: previousEntry.disposition,
      }],
      nextRecords: [{
        sourceRecordId: nextEntry.candidate.sourceRecordId,
        candidate: nextEntry.candidate,
        decision: nextEntry.decision,
        disposition: nextEntry.disposition,
      }],
    });

    expect(report.entries[0]?.classifications).toContain("nutrition_changed");
    expect(report.entries[0]?.classifications).not.toEqual(["unchanged"]);
  });

  it.each([14, 901])("rejects leaseSeconds=%s before issuing any command", async (leaseSeconds) => {
    const manifestContent: FoodCatalogDryRunManifestContent = {
      source: source(),
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
    const store = noCommandStore();

    await expect(executeApprovedFoodCatalogDraftMutation(
      store,
      exactExecutionInput(manifestContent, leaseSeconds),
    )).rejects.toThrow(/leaseSeconds.*15.*900/i);
    expect(store.prepareExecution).not.toHaveBeenCalled();
  });

  it("derives release-diff membership and classifications from immutable previous/next manifest records", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql",
      "utf8",
    ).toLowerCase();
    const verification = fs.readFileSync(
      "supabase/verification/food-catalog-ingestion-v2-authority.sql",
      "utf8",
    ).toLowerCase();
    const releaseFunction = migration.slice(
      migration.indexOf("create or replace function public.food_catalog_ingestion_record_release_diff_v2"),
      migration.indexOf("create or replace function public.food_catalog_ingestion_complete_run_v2"),
    );

    expect(releaseFunction).toContain("food_ingestion_manifest_records");
    expect(releaseFunction).toContain("candidate_json");
    expect(releaseFunction).toContain("decision_json");
    expect(releaseFunction).toContain("disposition_json");
    expect(releaseFunction).toMatch(/release diff.*classification.*manifest|manifest.*classification.*release diff/i);
    expect(verification).toContain("release diff manifest authority");
    expect(verification).toContain("false unchanged release diff rejected");
  });
});