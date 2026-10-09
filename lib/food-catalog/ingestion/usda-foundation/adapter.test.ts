import { describe, expect, it } from "vitest";
import { buildFoodCatalogDryRun } from "../engine";
import type { FoodCatalogMatchIndex } from "../matching";
import {
  createUsdaFoundationAdapter,
  parseUsdaFoundationJson,
  type UsdaFoundationLock,
  type UsdaFoundationFood
} from "./index";

const sourceHash = "a".repeat(64);
const lock: UsdaFoundationLock = {
  provider: "USDA_FDC",
  dataset: "FoundationFoods",
  release: "2026-04-30",
  sourceReleaseDate: "2026-04-30",
  sourceVersion: "2026-04-30",
  sourceFilename: "FoodData_Central_foundation_food_json_2026-04-30.zip",
  sourceJsonFilename: "FoodData_Central_foundation_food_json_2026-04-30.json",
  sourceUrl: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip",
  sourceChecksumSha256: sourceHash,
  sourceBytes: 469303,
  importerVersion: "plan8-1a0-v1",
  configChecksumSha256: "b".repeat(64),
  licenseName: "CC0 1.0 Universal",
  licenseReference: "https://creativecommons.org/publicdomain/zero/1.0/",
  expectedDataType: "Foundation",
  productionAuthority: false,
  config: {
    schemaVersion: "usda-foundation-1a0-config-v1",
    adapterVersion: "1",
    nutrition: {
      calories: [2048, 2047], protein_g: [1003], fat_g: [1004],
      carbs_g: [1005], fiber_g: [1079], saturated_fat_g: [1258],
      sugars_g: [2000, 1063], sodium_mg: [1093]
    },
    legacyEnergyFallback: false,
    namingPolicy: "preserve_usda_description",
    belowLimitPolicy: "explicit_below_limit_zero_is_unknown",
    taxonomyMappings: {},
    marketPolicy: "usda_us_provenance_only_no_market_assignment",
    identityPolicy: "source_identity_only_no_inferred_semantic_match",
    basis: "100_g"
  }
};
const nutrient = (id: number, amount: number | null, unitName = "g", extra = {}) =>
  ({ id: id + 999, nutrient: { id, unitName }, amount, ...extra });
const example: UsdaFoundationFood = {
  fdcId: 321358,
  dataType: "Foundation",
  description: "Hummus, commercial, raw",
  publicationDate: "4/1/2019",
  foodCategory: { description: "Legumes and Legume Products" },
  foodNutrients: [
    nutrient(2047, 250, "kcal"), nutrient(2048, 230, "kcal"),
    nutrient(1003, 5), nutrient(1004, 0), nutrient(1005, 12),
    nutrient(1258, 2), nutrient(1063, 3), nutrient(2000, 4),
    nutrient(1079, 0), nutrient(1093, 110, "mg")
  ],
  foodPortions: [{
    id: 118804, amount: 2, gramWeight: 33.9,
    measureUnit: { id: 1001, name: "tablespoon", abbreviation: "tbsp" },
    modifier: ""
  }]
};
const emptyIndex: FoodCatalogMatchIndex = {
  sourceIdentities: [], gtinOwners: [], redirects: [], semanticIdentities: [],
  qualifiedAliases: [], possibleDuplicateNames: []
};

describe("USDA Foundation 1A0 source authority", () => {
  it("rejects non-Foundation and missing fdcId, and counts null archive slots", () => {
    const parsed = parseUsdaFoundationJson(JSON.stringify({ FoundationFoods: [null, example] }));
    expect(parsed.nullSlotCount).toBe(1);
    expect(parsed.foods).toHaveLength(1);
    expect(() => parseUsdaFoundationJson(JSON.stringify({ FoundationFoods: [
      { ...example, dataType: "Branded" }
    ] }))).toThrow(/Foundation/);
    expect(() => parseUsdaFoundationJson(JSON.stringify({ FoundationFoods: [
      { ...example, fdcId: null }
    ] }))).toThrow(/fdcId/);
  });

  it("maps release-aware nutrition and chooses Specific before General; source zero survives", () => {
    const [candidate] = createUsdaFoundationAdapter(lock).toCandidates({
      sourceZipSha256: sourceHash, sourceZipBytes: lock.sourceBytes, foods: [example]
    });
    expect(candidate!.nutrition).toMatchObject({
      calories: 230, protein_g: 5, fat_g: 0, carbs_g: 12,
      saturated_fat_g: 2, sugars_g: 4, fiber_g: 0, sodium_mg: 110,
      basis_amount: 100, basis_unit: "g"
    });
    expect((candidate!.sourceNutrition as { selectedNutrientIds: Record<string, number | null> }).selectedNutrientIds)
      .toMatchObject({ calories: 2048, sugars_g: 2000, saturated_fat_g: 1258 });
    expect(candidate!.servings?.[0]).toMatchObject({
      servingKey: "usda-foundation-portion:118804",
      gramWeight: 33.9, milliliterVolume: null, amount: 2, unit: "tablespoon"
    });
    expect(candidate!.canonicalName).toBe(example.description);
    expect(candidate!.names?.[0]?.value).toBe(example.description);
    expect(candidate!.brandName).toBeNull();
    expect(candidate!.gtins).toEqual([]);
    expect(candidate!.globallyRelevant).toBe(false);
    expect(candidate!.marketScopes).toEqual([]);
    expect(candidate!.taxonomyEvidence?.[0]?.mappedTaxonomyId).toBeNull();
  });

  it("uses General fallback, then missing; never falls back to legacy 1008", () => {
    const adapter = createUsdaFoundationAdapter(lock);
    const gen = adapter.toCandidates({
      sourceZipSha256: sourceHash, sourceZipBytes: lock.sourceBytes,
      foods: [{ ...example, foodNutrients: [nutrient(2047, 150, "kcal"), nutrient(1008, 200, "kcal")] }]
    })[0]!;
    expect(gen.nutrition.calories).toBe(150);
    const missing = adapter.toCandidates({
      sourceZipSha256: sourceHash, sourceZipBytes: lock.sourceBytes,
      foods: [{ ...example, foodNutrients: [nutrient(1008, 200, "kcal")] }]
    })[0]!;
    expect(missing.nutrition.calories).toBeNull();
  });

  it("does not treat an explicit below-LOQ zero as an ordinary measured zero", () => {
    const [item] = createUsdaFoundationAdapter(lock).toCandidates({
      sourceZipSha256: sourceHash, sourceZipBytes: lock.sourceBytes,
      foods: [{ ...example, foodNutrients: [
        nutrient(1003, 0, "g", { footnote: "Below limit of quantification" }),
        nutrient(1004, 0)
      ] }]
    });
    expect(item!.nutrition.protein_g).toBeNull();
    expect(item!.nutrition.fat_g).toBe(0);
    expect((item!.sourceNutrition as { belowLimitNutrientIds: number[] }).belowLimitNutrientIds)
      .toContain(1003);
  });

  it("preserves qualified descriptions and refuses invented portion conversions", () => {
    const [item] = createUsdaFoundationAdapter(lock).toCandidates({
      sourceZipSha256: sourceHash, sourceZipBytes: lock.sourceBytes,
      foods: [{ ...example, description: "Chicken, skinless, cooked, boneless",
        foodPortions: [{ id: 22, amount: 1, measureUnit: { name: "cup" }, gramWeight: null }]
      }]
    });
    expect(item!.canonicalName).toBe("Chicken, skinless, cooked, boneless");
    expect(item!.servings).toEqual([]);
    expect((item!.sourceServing as { unusablePortionIds: number[] }).unusablePortionIds).toEqual([22]);
  });

  it("is order-independent for unordered nutrient and source-food arrays", () => {
    const second = { ...example, fdcId: 999999, description: "Hummus, prepared" };
    const adapter = createUsdaFoundationAdapter(lock);
    const a = { sourceZipSha256: sourceHash, sourceZipBytes: lock.sourceBytes, foods: [example, second] };
    const b = { ...a, foods: [{ ...second, foodNutrients: [...example.foodNutrients!].reverse() },
      { ...example, foodNutrients: [...example.foodNutrients!].reverse() }] };
    const first = buildFoodCatalogDryRun(adapter, a, emptyIndex);
    const secondRun = buildFoodCatalogDryRun(adapter, b, emptyIndex);
    expect(first.manifestContentChecksumSha256).toBe(secondRun.manifestContentChecksumSha256);
    expect(first.semanticBatchIdentityChecksumSha256).toBe(secondRun.semanticBatchIdentityChecksumSha256);
  });

  it("never auto-matches by name alone", () => {
    const run = buildFoodCatalogDryRun(createUsdaFoundationAdapter(lock), {
      sourceZipSha256: sourceHash, sourceZipBytes: lock.sourceBytes, foods: [example]
    }, { ...emptyIndex, possibleDuplicateNames: [{
      normalizedName: example.description.toLowerCase(), foodId: "existing-food"
    }] });
    expect(run.manifestContent.candidates[0]!.decision.kind).toBe("possible_duplicate");
    expect(run.manifestContent.candidates[0]!.disposition.kind).toBe("quarantine");
  });

  it("rejects an artifact SHA mismatch before ingestion", () => {
    expect(() => createUsdaFoundationAdapter(lock).toCandidates({
      sourceZipSha256: "c".repeat(64), sourceZipBytes: lock.sourceBytes, foods: [example]
    })).toThrow(/checksum/i);
  });
});
