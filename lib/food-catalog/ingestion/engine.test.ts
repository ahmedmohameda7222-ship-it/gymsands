import { describe, expect, it } from "vitest";
import type {
  FoodCatalogCandidateInput,
  FoodCatalogExpectedMutationCounts,
  FoodCatalogSourceDescriptor
} from "./contracts";
import {
  buildFoodCatalogDryRun,
  buildSemanticBatchIdentity
} from "./engine";
import { createDryRunManifestEnvelope } from "./manifest";
import type { FoodCatalogMatchIndex } from "./matching";
import { createSyntheticFoodCatalogAdapter } from "./synthetic-adapter";

const source = (overrides: Partial<FoodCatalogSourceDescriptor> = {}): FoodCatalogSourceDescriptor => ({
  provider: "reference-provider",
  dataset: "reference-dataset",
  sourceVersion: "2026.09",
  sourceReleaseDate: "2026-09-01",
  licenseName: "Reference",
  licenseReference: null,
  sourceReference: "reference://release/2026.09",
  sourceChecksumSha256: "a".repeat(64),
  importerVersion: "plan4-test-1",
  configChecksumSha256: "b".repeat(64),
  ...overrides
});

const candidate = (
  sourceRecordId: string,
  overrides: Partial<FoodCatalogCandidateInput> = {}
): FoodCatalogCandidateInput => ({
  sourceRecordId,
  sourceReference: null,
  sourceRecordChecksumSha256: "c".repeat(64),
  canonicalName: `Food ${sourceRecordId}`,
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
    basis_unit: "g"
  },
  aliases: [],
  names: [],
  identityEvidence: {
    semanticSignature: null,
    preparation: null,
    state: null,
    form: null,
    structuredEvidenceKey: null
  },
  servings: [],
  taxonomyEvidence: [],
  gtins: [],
  marketScopes: [],
  globallyRelevant: false,
  sourceNutrition: null,
  sourceServing: null,
  ...overrides
});

const emptyIndex = (): FoodCatalogMatchIndex => ({
  sourceIdentities: [],
  gtinOwners: [],
  redirects: [],
  semanticIdentities: [],
  qualifiedAliases: [],
  possibleDuplicateNames: []
});

const expectedCounts = (
  overrides: Partial<FoodCatalogExpectedMutationCounts> = {}
): FoodCatalogExpectedMutationCounts => ({
  input: 1,
  accepted: 1,
  rejected: 0,
  matched: 0,
  created: 1,
  possibleDuplicate: 0,
  quarantined: 0,
  ...overrides
});

describe("Food Catalog Plan 4 ingestion engine", () => {
  it("composes adapter -> normalize -> validate -> match -> disposition -> deterministic manifest", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const index = emptyIndex();
    index.sourceIdentities.push({
      provider: "reference-provider",
      dataset: "reference-dataset",
      sourceVersion: "2026.09",
      sourceRecordId: "match",
      foodId: "food-existing"
    });
    index.possibleDuplicateNames.push({
      normalizedName: "duplicate food",
      foodId: "food-duplicate-candidate"
    });

    const result = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [
        candidate("match"),
        candidate("duplicate", { canonicalName: "Duplicate Food" }),
        candidate("invalid", { canonicalName: "   " })
      ]
    }, index);

    expect(result.manifestContent.candidates.map((entry) => ({
      sourceRecordId: entry.candidate.sourceRecordId,
      decision: entry.decision.kind,
      disposition: entry.disposition.kind
    }))).toEqual([
      { sourceRecordId: "duplicate", decision: "possible_duplicate", disposition: "quarantine" },
      { sourceRecordId: "invalid", decision: "reject", disposition: "reject" },
      { sourceRecordId: "match", decision: "match", disposition: "accept" }
    ]);
    expect(result.manifestContent.expectedMutations).toEqual({
      input: 3,
      accepted: 1,
      rejected: 1,
      matched: 1,
      created: 0,
      possibleDuplicate: 1,
      quarantined: 1
    });
    expect(result.manifestContentChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.semanticBatchIdentityChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("quarantines conflicting canonical authorities instead of accepting precedence-only matches", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const index = emptyIndex();
    index.sourceIdentities.push({
      provider: "reference-provider",
      dataset: "reference-dataset",
      sourceVersion: "2026.09",
      sourceRecordId: "conflict",
      foodId: "food-source-owner"
    });
    index.gtinOwners.push({ gtin: "4006381333931", foodId: "food-barcode-owner" });

    const result = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [candidate("conflict", { gtins: ["4006381333931"] })]
    }, index);
    const entry = result.manifestContent.candidates[0]!;

    expect(entry.decision).toEqual({ kind: "match", foodId: "food-source-owner" });
    expect(entry.disposition).toEqual({
      kind: "quarantine",
      reasonCodes: ["barcode_conflict", "identity_conflict"]
    });
    expect(result.manifestContent.expectedMutations).toEqual({
      input: 1,
      accepted: 0,
      rejected: 0,
      matched: 0,
      created: 0,
      possibleDuplicate: 0,
      quarantined: 1
    });
  });

  it("quarantines same-manifest GTIN collisions before Production materialization", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const result = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [
        candidate("collision-a", { gtins: ["4006381333931"] }),
        candidate("collision-b", { gtins: ["4006381333931"] })
      ]
    }, emptyIndex());

    expect(result.manifestContent.candidates.map((entry) => ({
      sourceRecordId: entry.candidate.sourceRecordId,
      decision: entry.decision.kind,
      disposition: entry.disposition
    }))).toEqual([
      {
        sourceRecordId: "collision-a",
        decision: "create",
        disposition: { kind: "quarantine", reasonCodes: ["barcode_conflict", "identity_conflict"] }
      },
      {
        sourceRecordId: "collision-b",
        decision: "create",
        disposition: { kind: "quarantine", reasonCodes: ["barcode_conflict", "identity_conflict"] }
      }
    ]);
    expect(result.manifestContent.expectedMutations).toEqual({
      input: 2,
      accepted: 0,
      rejected: 0,
      matched: 0,
      created: 0,
      possibleDuplicate: 0,
      quarantined: 2
    });
  });

  it("canonicalizes source-record checksum casing before manifest and semantic identity hashing", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const upper = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [candidate("checksum-case", { sourceRecordChecksumSha256: "AB".repeat(32) })]
    }, emptyIndex());
    const lower = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [candidate("checksum-case", { sourceRecordChecksumSha256: "ab".repeat(32) })]
    }, emptyIndex());

    expect(upper.manifestContent.candidates[0]?.candidate.sourceRecordChecksumSha256).toBe("ab".repeat(32));
    expect(upper.manifestContentChecksumSha256).toBe(lower.manifestContentChecksumSha256);
    expect(upper.semanticBatchIdentityChecksumSha256).toBe(lower.semanticBatchIdentityChecksumSha256);
  });

  it("changes semantic batch identity for source/config/release/manifest/expected-count changes", () => {
    const baseInput = {
      source: source(),
      manifestContentChecksumSha256: "d".repeat(64),
      expectedMutations: expectedCounts()
    };
    const baseline = buildSemanticBatchIdentity(baseInput);
    const variants = [
      { ...baseInput, source: source({ provider: "other-provider" }) },
      { ...baseInput, source: source({ configChecksumSha256: "e".repeat(64) }) },
      { ...baseInput, source: source({ sourceReleaseDate: "2026-09-02" }) },
      { ...baseInput, manifestContentChecksumSha256: "f".repeat(64) },
      { ...baseInput, expectedMutations: expectedCounts({ accepted: 0, created: 0, quarantined: 1 }) }
    ];

    for (const variant of variants) {
      expect(buildSemanticBatchIdentity(variant)).not.toBe(baseline);
    }
  });

  it("excludes volatile run-attempt envelope metadata from semantic batch identity", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const result = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [candidate("one")]
    }, emptyIndex());
    const first = createDryRunManifestEnvelope(result.manifestContent, {
      generatedAt: "2026-09-04T10:00:00.000Z",
      runId: "run-a",
      diagnosticsLocation: "diag-a"
    });
    const second = createDryRunManifestEnvelope(result.manifestContent, {
      generatedAt: "2026-09-04T11:00:00.000Z",
      runId: "run-b",
      diagnosticsLocation: "diag-b"
    });

    const identityFrom = (envelope: typeof first) => buildSemanticBatchIdentity({
      source: envelope.content.source,
      manifestContentChecksumSha256: envelope.manifestContentChecksumSha256,
      expectedMutations: envelope.content.expectedMutations
    });
    expect(identityFrom(first)).toBe(identityFrom(second));
    expect(identityFrom(first)).toBe(result.semanticBatchIdentityChecksumSha256);
  });

  it("replays 1,001 provider-neutral candidates with identical manifest and batch identity under reverse order", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const candidates = Array.from({ length: 1001 }, (_, index) =>
      candidate(`record-${String(index).padStart(4, "0")}`)
    );
    const first = buildFoodCatalogDryRun(adapter, { source: source(), candidates }, emptyIndex());
    const second = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [...candidates].reverse()
    }, emptyIndex());

    expect(first.manifestContentChecksumSha256).toBe(second.manifestContentChecksumSha256);
    expect(first.semanticBatchIdentityChecksumSha256).toBe(second.semanticBatchIdentityChecksumSha256);
    expect(first.manifestContent.expectedMutations.created).toBe(1001);
  });
});
