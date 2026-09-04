import { describe, expect, it } from "vitest";
import type {
  FoodCatalogDryRunManifestContent,
  FoodCatalogNormalizedCandidate,
  FoodCatalogSourceDescriptor
} from "./contracts";
import {
  checksumManifestContent,
  createDryRunManifestEnvelope,
  stableJson
} from "./manifest";

const source = (overrides: Partial<FoodCatalogSourceDescriptor> = {}): FoodCatalogSourceDescriptor => ({
  provider: "provider",
  dataset: "dataset",
  sourceVersion: "2026.08",
  sourceReleaseDate: "2026-08-01",
  licenseName: "Example License",
  licenseReference: null,
  sourceReference: null,
  sourceChecksumSha256: "a".repeat(64),
  importerVersion: "1.0.0",
  configChecksumSha256: "b".repeat(64),
  ...overrides
});

const normalizedCandidate = (
  sourceRecordId: string,
  overrides: Partial<FoodCatalogNormalizedCandidate> = {}
): FoodCatalogNormalizedCandidate => ({
  sourceRecordId,
  sourceReference: null,
  sourceRecordChecksumSha256: null,
  canonicalName: `Food ${sourceRecordId}`,
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
    basis_unit: null
  },
  aliases: [
    { locale: "en", value: "Zulu", normalizedValue: "zulu" },
    { locale: "de", value: "Alpha", normalizedValue: "alpha" }
  ],
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
  gtins: ["4006381333931", "036000291452"],
  marketScopes: [
    { type: "region", code: "GCC", relevanceLevel: "secondary" },
    { type: "country", code: "DE", relevanceLevel: "primary" }
  ],
  globallyRelevant: false,
  sourceNutrition: null,
  sourceServing: null,
  ...overrides
});

const content = (overrides: Partial<FoodCatalogDryRunManifestContent> = {}): FoodCatalogDryRunManifestContent => ({
  source: source(),
  candidates: [
    {
      candidate: normalizedCandidate("b"),
      issues: [],
      decision: { kind: "possible_duplicate", candidateFoodIds: ["food-z", "food-a"] }
    },
    {
      candidate: normalizedCandidate("a"),
      issues: [],
      decision: { kind: "create" }
    }
  ],
  expectedMutations: {
    input: 2,
    accepted: 2,
    rejected: 0,
    matched: 0,
    created: 1,
    possibleDuplicate: 1
  },
  ...overrides
});

describe("Food Catalog deterministic manifest content", () => {
  it("serializes object keys canonically regardless of insertion order", () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("keeps volatile envelope timestamps/run metadata out of the content checksum", () => {
    const semanticContent = content();
    const first = createDryRunManifestEnvelope(semanticContent, {
      generatedAt: "2026-08-30T01:00:00.000Z",
      runId: "run-1",
      diagnosticsLocation: "/tmp/first"
    });
    const second = createDryRunManifestEnvelope(semanticContent, {
      generatedAt: "2026-08-30T02:00:00.000Z",
      runId: "run-2",
      diagnosticsLocation: "/tmp/second"
    });

    expect(first.generatedAt).not.toBe(second.generatedAt);
    expect(first.manifestContentChecksumSha256).toBe(second.manifestContentChecksumSha256);
  });

  it("is invariant to candidate, alias, GTIN, market-scope, and possible-duplicate ID ordering", () => {
    const first = content();
    const reordered = content({
      candidates: [
        first.candidates[1],
        {
          ...first.candidates[0],
          candidate: {
            ...first.candidates[0].candidate,
            aliases: [...first.candidates[0].candidate.aliases].reverse(),
            gtins: [...first.candidates[0].candidate.gtins].reverse(),
            marketScopes: [...first.candidates[0].candidate.marketScopes].reverse()
          },
          decision: { kind: "possible_duplicate", candidateFoodIds: ["food-a", "food-z"] }
        }
      ]
    });

    expect(checksumManifestContent(first)).toBe(checksumManifestContent(reordered));
  });

  it("changes when source checksum, importer version, or config checksum changes", () => {
    const baseline = checksumManifestContent(content());
    expect(checksumManifestContent(content({ source: source({ sourceChecksumSha256: "c".repeat(64) }) }))).not.toBe(baseline);
    expect(checksumManifestContent(content({ source: source({ importerVersion: "1.0.1" }) }))).not.toBe(baseline);
    expect(checksumManifestContent(content({ source: source({ configChecksumSha256: "d".repeat(64) }) }))).not.toBe(baseline);
  });

  it("changes when semantic candidate content changes", () => {
    const baselineContent = content();
    const changed = content({
      candidates: baselineContent.candidates.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              candidate: { ...entry.candidate, canonicalName: "Semantically changed food" }
            }
          : entry
      )
    });

    expect(checksumManifestContent(changed)).not.toBe(checksumManifestContent(baselineContent));
  });
});
