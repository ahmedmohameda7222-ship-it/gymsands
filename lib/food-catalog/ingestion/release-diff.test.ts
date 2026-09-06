import { describe, expect, it } from "vitest";
import type { FoodCatalogNormalizedCandidate } from "./contracts";
import type { FoodCatalogReleaseRecord } from "./release-diff";
import { diffFoodCatalogReleases } from "./release-diff";

const candidate = (id: string, overrides: Partial<FoodCatalogNormalizedCandidate> = {}): FoodCatalogNormalizedCandidate => ({
  sourceRecordId: id,
  sourceReference: null,
  sourceRecordChecksumSha256: "a".repeat(64),
  canonicalName: `Food ${id}`,
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
    basis_unit: "g"
  },
  aliases: [{ locale: "en", value: `Alias ${id}`, normalizedValue: `alias ${id}` }],
  names: [{ locale: "en", script: "Latn", role: "source", value: `Food ${id}`, normalizedValue: `food ${id}` }],
  identityEvidence: {
    semanticSignature: `sig:${id}`,
    preparation: "raw",
    state: "solid",
    form: "whole",
    structuredEvidenceKey: null
  },
  servings: [{
    servingKey: "100-g",
    amount: 100,
    unit: "g",
    gramWeight: 100,
    milliliterVolume: null,
    label: "100 g",
    sourceEvidence: { exact: true }
  }],
  taxonomyEvidence: [{ taxonomy: "primary", sourceCode: "A", mappedTaxonomyId: "tax-a" }],
  gtins: ["4006381333931"],
  marketScopes: [{ type: "country", code: "DE", relevanceLevel: "primary" }],
  globallyRelevant: false,
  sourceNutrition: null,
  sourceServing: null,
  ...overrides
});

const record = (id: string, overrides: Partial<FoodCatalogReleaseRecord> = {}): FoodCatalogReleaseRecord => ({
  sourceRecordId: id,
  candidate: candidate(id),
  decision: { kind: "match", foodId: `food-${id}` },
  disposition: { kind: "accept", reasonCodes: [] },
  ...overrides
});

describe("Food Catalog Plan 4 release diff", () => {
  it("classifies unchanged, source-record-added, and source-record-removed deterministically", () => {
    const report = diffFoodCatalogReleases({
      previousBatchIdentity: "batch-old",
      nextBatchIdentity: "batch-new",
      previousRecords: [record("same"), record("removed")],
      nextRecords: [record("added"), record("same")]
    });

    expect(report.entries.map((entry) => [entry.sourceRecordId, entry.classifications])).toEqual([
      ["added", ["source_record_added"]],
      ["removed", ["source_record_removed"]],
      ["same", ["unchanged"]]
    ]);
  });

  it("classifies nutrition, serving, naming, barcode, taxonomy, market, canonical-match and quarantine transitions", () => {
    const previous = record("changed");
    const next = record("changed", {
      candidate: candidate("changed", {
        canonicalName: "Renamed Food",
        nutrition: { ...candidate("changed").nutrition, protein_g: 12 },
        servings: [{ ...candidate("changed").servings[0]!, gramWeight: 120 }],
        aliases: [{ locale: "de", value: "Neuer Name", normalizedValue: "neuer name" }],
        names: [{ locale: "de", script: "Latn", role: "source", value: "Neuer Name", normalizedValue: "neuer name" }],
        gtins: ["036000291452"],
        taxonomyEvidence: [{ taxonomy: "primary", sourceCode: "B", mappedTaxonomyId: "tax-b" }],
        marketScopes: [{ type: "country", code: "US", relevanceLevel: "secondary" }]
      }),
      decision: { kind: "match", foodId: "food-other" },
      disposition: { kind: "quarantine", reasonCodes: ["evidence_inconsistency"] }
    });

    const report = diffFoodCatalogReleases({
      previousBatchIdentity: "batch-old",
      nextBatchIdentity: "batch-new",
      previousRecords: [previous],
      nextRecords: [next]
    });

    expect(report.entries[0]?.classifications).toEqual([
      "nutrition_changed",
      "serving_changed",
      "naming_changed",
      "barcode_changed",
      "taxonomy_changed",
      "market_evidence_changed",
      "canonical_match_changed",
      "newly_quarantined",
      "suspicious_material_change"
    ]);
  });

  it("classifies quarantine resolution without silently changing catalog truth", () => {
    const previous = record("resolved", { disposition: { kind: "quarantine", reasonCodes: ["possible_duplicate"] } });
    const next = record("resolved");
    const report = diffFoodCatalogReleases({
      previousBatchIdentity: "batch-old",
      nextBatchIdentity: "batch-new",
      previousRecords: [previous],
      nextRecords: [next]
    });

    expect(report.entries[0]?.classifications).toEqual(["quarantine_resolved"]);
  });

  it("produces the same checksum and entries independent of release-record order", () => {
    const previous = [record("b"), record("a")];
    const next = [record("a"), record("b")];
    const first = diffFoodCatalogReleases({
      previousBatchIdentity: "batch-old",
      nextBatchIdentity: "batch-new",
      previousRecords: previous,
      nextRecords: next
    });
    const second = diffFoodCatalogReleases({
      previousBatchIdentity: "batch-old",
      nextBatchIdentity: "batch-new",
      previousRecords: [...previous].reverse(),
      nextRecords: [...next].reverse()
    });

    expect(first.entries).toEqual(second.entries);
    expect(first.checksumSha256).toBe(second.checksumSha256);
    expect(first.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
