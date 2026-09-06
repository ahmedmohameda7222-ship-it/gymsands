import { describe, expect, it } from "vitest";
import type {
  FoodCatalogCandidateInput,
  FoodCatalogSourceDescriptor
} from "./contracts";
import { buildFoodCatalogDryRun } from "./engine";
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

const build = (candidates: FoodCatalogCandidateInput[], sourceOverride = source()) =>
  buildFoodCatalogDryRun(
    createSyntheticFoodCatalogAdapter(),
    { source: sourceOverride, candidates },
    emptyIndex()
  );

describe("Food Catalog Plan 4 adversarial self-review regressions", () => {
  it("quarantines same-manifest unowned semantic-signature collisions", () => {
    const result = build([
      candidate("semantic-a", {
        identityEvidence: {
          semanticSignature: "shared:strong:identity",
          preparation: "raw",
          state: "solid",
          form: "whole",
          structuredEvidenceKey: null
        }
      }),
      candidate("semantic-b", {
        identityEvidence: {
          semanticSignature: "shared:strong:identity",
          preparation: "raw",
          state: "solid",
          form: "whole",
          structuredEvidenceKey: null
        }
      })
    ]);

    expect(result.manifestContent.candidates.map((entry) => ({
      decision: entry.decision.kind,
      disposition: entry.disposition
    }))).toEqual([
      { decision: "create", disposition: { kind: "quarantine", reasonCodes: ["identity_conflict"] } },
      { decision: "create", disposition: { kind: "quarantine", reasonCodes: ["identity_conflict"] } }
    ]);
  });

  it("quarantines same-manifest unowned qualified-alias collisions", () => {
    const sharedIdentity = {
      semanticSignature: null,
      preparation: "fermented",
      state: "solid",
      form: "whole",
      structuredEvidenceKey: null
    };
    const result = build([
      candidate("alias-a", {
        aliases: [{ locale: "en", value: "Shared Qualified Alias" }],
        identityEvidence: sharedIdentity
      }),
      candidate("alias-b", {
        aliases: [{ locale: "en", value: "Shared Qualified Alias" }],
        identityEvidence: sharedIdentity
      })
    ]);

    expect(result.manifestContent.candidates.map((entry) => ({
      decision: entry.decision.kind,
      disposition: entry.disposition
    }))).toEqual([
      { decision: "create", disposition: { kind: "quarantine", reasonCodes: ["identity_conflict"] } },
      { decision: "create", disposition: { kind: "quarantine", reasonCodes: ["identity_conflict"] } }
    ]);
  });

  it("canonicalizes source-artifact and config SHA casing before manifest and semantic hashing", () => {
    const upper = build(
      [candidate("checksum-case")],
      source({
        sourceChecksumSha256: "AB".repeat(32),
        configChecksumSha256: "CD".repeat(32)
      })
    );
    const lower = build(
      [candidate("checksum-case")],
      source({
        sourceChecksumSha256: "ab".repeat(32),
        configChecksumSha256: "cd".repeat(32)
      })
    );

    expect(upper.manifestContent.source.sourceChecksumSha256).toBe("ab".repeat(32));
    expect(upper.manifestContent.source.configChecksumSha256).toBe("cd".repeat(32));
    expect(upper.manifestContentChecksumSha256).toBe(lower.manifestContentChecksumSha256);
    expect(upper.semanticBatchIdentityChecksumSha256).toBe(lower.semanticBatchIdentityChecksumSha256);
  });

  it("preserves formatting-only malformed GTIN evidence until validation rejects it", () => {
    const result = build([candidate("formatting-only-gtin", { gtins: [" - - "] })]);
    const entry = result.manifestContent.candidates[0]!;

    expect(entry.candidate.gtins).toHaveLength(1);
    expect(entry.issues.map((issue) => issue.code)).toContain("invalid_gtin");
    expect(entry.decision.kind).toBe("reject");
    expect(entry.disposition.kind).toBe("reject");
  });
});
