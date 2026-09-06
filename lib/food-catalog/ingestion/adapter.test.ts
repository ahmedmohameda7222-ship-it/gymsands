import { describe, expect, it } from "vitest";
import type { FoodCatalogSourceAdapter } from "./adapter";
import { createSyntheticFoodCatalogAdapter } from "./synthetic-adapter";

const fixture = {
  source: {
    provider: "reference-provider",
    dataset: "reference-dataset",
    sourceVersion: "2026.09",
    sourceReleaseDate: "2026-09-01",
    licenseName: "Reference License",
    licenseReference: "license:reference",
    sourceReference: "source:reference",
    sourceChecksumSha256: "a".repeat(64),
    importerVersion: "plan4-reference-1",
    configChecksumSha256: "b".repeat(64)
  },
  candidates: [
    {
      sourceRecordId: "ref-1",
      sourceReference: "source:reference#ref-1",
      sourceRecordChecksumSha256: "c".repeat(64),
      canonicalName: "Reference Food",
      brandName: null,
      servingLabel: "100 g",
      category: "reference",
      cuisine: null,
      nutrition: {
        calories: 100,
        protein_g: 0,
        carbs_g: null,
        fat_g: 2,
        saturated_fat_g: null,
        fiber_g: null,
        sugars_g: null,
        sodium_mg: null,
        basis_amount: 100,
        basis_unit: "g" as const
      },
      aliases: [{ locale: "en", value: "Reference alias" }],
      names: [
        { locale: "en", script: "Latn", role: "source" as const, value: "Reference Food" },
        { locale: "ar", script: "Arab", role: "source" as const, value: "طعام مرجعي" }
      ],
      identityEvidence: {
        semanticSignature: "reference-food:raw",
        preparation: "raw",
        state: "solid",
        form: "whole"
      },
      servings: [
        {
          servingKey: "100-g",
          amount: 100,
          unit: "g",
          gramWeight: 100,
          milliliterVolume: null,
          label: "100 g",
          sourceEvidence: { exact: true }
        }
      ],
      taxonomyEvidence: [{ taxonomy: "reference", sourceCode: "R1", mappedTaxonomyId: "taxonomy-1" }],
      gtins: [],
      marketScopes: [{ type: "country" as const, code: "DE", relevanceLevel: "primary" as const }],
      globallyRelevant: false,
      sourceNutrition: { sourceProtein: 0, sourceCarbs: null },
      sourceServing: { exact: true }
    }
  ]
};

describe("Food Catalog Plan 4 provider-neutral adapter contract", () => {
  it("is a pure deterministic transformation and preserves structured evidence including NULL versus known zero", () => {
    const adapter: FoodCatalogSourceAdapter<typeof fixture> = createSyntheticFoodCatalogAdapter();

    const first = adapter.toCandidates(fixture);
    const second = adapter.toCandidates(structuredClone(fixture));

    expect(adapter.describeSource(fixture)).toEqual(fixture.source);
    expect(first).toEqual(second);
    expect(first[0]?.nutrition.protein_g).toBe(0);
    expect(first[0]?.nutrition.carbs_g).toBeNull();
    expect(first[0]?.names).toEqual(fixture.candidates[0]?.names);
    expect(first[0]?.identityEvidence?.semanticSignature).toBe("reference-food:raw");
    expect(first[0]?.servings?.[0]?.gramWeight).toBe(100);
    expect(first[0]?.taxonomyEvidence?.[0]?.mappedTaxonomyId).toBe("taxonomy-1");
  });

  it("does not expose persistence, activation, verification, or generation authority through the adapter", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    expect(Object.keys(adapter).sort()).toEqual([
      "adapterId",
      "adapterVersion",
      "describeSource",
      "toCandidates"
    ]);
  });
});
