import { describe, expect, it } from "vitest";
import type { FoodCatalogNormalizedCandidate, FoodCatalogSourceDescriptor } from "./contracts";
import type { FoodCatalogMatchIndex } from "./matching";
import { decideCanonicalMatch } from "./matching";

const source: FoodCatalogSourceDescriptor = {
  provider: "provider",
  dataset: "dataset",
  sourceVersion: "2026.09",
  sourceReleaseDate: "2026-09-01",
  licenseName: "Reference",
  licenseReference: null,
  sourceReference: null,
  sourceChecksumSha256: "a".repeat(64),
  importerVersion: "1",
  configChecksumSha256: "b".repeat(64)
};

const candidate = (overrides: Partial<FoodCatalogNormalizedCandidate> = {}): FoodCatalogNormalizedCandidate => ({
  sourceRecordId: "record-1",
  sourceReference: null,
  sourceRecordChecksumSha256: "c".repeat(64),
  canonicalName: "Greek Yogurt",
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
  aliases: [{ locale: "en", value: "Greek yoghurt", normalizedValue: "greek yoghurt" }],
  names: [],
  identityEvidence: {
    semanticSignature: "dairy:yogurt:plain",
    preparation: "fermented",
    state: "solid",
    form: "whole",
    structuredEvidenceKey: "identity:greek-yogurt"
  },
  servings: [],
  taxonomyEvidence: [],
  gtins: ["4006381333931"],
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

const decide = (index: FoodCatalogMatchIndex, value = candidate()) =>
  decideCanonicalMatch({ source, candidate: value, index });

describe("Food Catalog Plan 4 deterministic matching", () => {
  it("prefers exact versioned source identity over conflicting GTIN evidence", () => {
    const index = emptyIndex();
    index.sourceIdentities.push({
      provider: source.provider,
      dataset: source.dataset,
      sourceVersion: source.sourceVersion,
      sourceRecordId: "record-1",
      foodId: "food-source"
    });
    index.gtinOwners.push({ gtin: "4006381333931", foodId: "food-gtin" });

    expect(decide(index)).toEqual({ kind: "match", foodId: "food-source" });
  });

  it("prefers exact GTIN over strong semantic identity", () => {
    const index = emptyIndex();
    index.gtinOwners.push({ gtin: "4006381333931", foodId: "food-gtin" });
    index.semanticIdentities.push({ semanticSignature: "dairy:yogurt:plain", foodId: "food-semantic" });

    expect(decide(index)).toEqual({ kind: "match", foodId: "food-gtin" });
  });

  it("resolves an approved canonical redirect before returning a match", () => {
    const index = emptyIndex();
    index.gtinOwners.push({ gtin: "4006381333931", foodId: "food-old" });
    index.redirects.push({ sourceFoodId: "food-old", targetFoodId: "food-root" });

    expect(decide(index)).toEqual({ kind: "match", foodId: "food-root" });
  });

  it("matches one exact strong structured semantic identity", () => {
    const index = emptyIndex();
    index.semanticIdentities.push({ semanticSignature: "dairy:yogurt:plain", foodId: "food-semantic" });

    expect(decide(index)).toEqual({ kind: "match", foodId: "food-semantic" });
  });

  it("matches high-confidence alias evidence only with exact state, preparation, and form", () => {
    const index = emptyIndex();
    index.qualifiedAliases.push({
      normalizedAlias: "greek yoghurt",
      state: "solid",
      preparation: "fermented",
      form: "whole",
      foodId: "food-qualified-alias"
    });

    expect(decide(index)).toEqual({ kind: "match", foodId: "food-qualified-alias" });
    expect(decide(index, candidate({ identityEvidence: { ...candidate().identityEvidence, form: null } }))).toEqual({ kind: "create" });
  });

  it("fails closed to POSSIBLE_DUPLICATE when one stable stage has conflicting owners", () => {
    const index = emptyIndex();
    index.gtinOwners.push(
      { gtin: "4006381333931", foodId: "food-z" },
      { gtin: "4006381333931", foodId: "food-a" }
    );

    expect(decide(index)).toEqual({ kind: "possible_duplicate", candidateFoodIds: ["food-a", "food-z"] });
  });

  it("never auto-matches on name-only evidence", () => {
    const index = emptyIndex();
    index.possibleDuplicateNames.push({ normalizedName: "greek yogurt", foodId: "food-name-only" });

    expect(decide(index)).toEqual({ kind: "possible_duplicate", candidateFoodIds: ["food-name-only"] });
  });

  it("never auto-matches on nutrition similarity alone", () => {
    expect(decide(emptyIndex(), candidate({ nutrition: { ...candidate().nutrition, calories: 100 } }))).toEqual({ kind: "create" });
  });

  it("creates a distinct Food when no structured identity evidence matches", () => {
    expect(decide(emptyIndex())).toEqual({ kind: "create" });
  });
});
