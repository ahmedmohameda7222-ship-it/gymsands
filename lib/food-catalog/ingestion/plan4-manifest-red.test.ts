import { describe, expect, it } from "vitest";
import { buildPlan4ManifestContent, checksumManifestContent } from "./manifest";
import { normalizeCandidate } from "./normalize";
import type { FoodCatalogCandidateInput, FoodCatalogSourceDescriptor } from "./contracts";

const source: FoodCatalogSourceDescriptor = {
  provider: "reference-provider",
  dataset: "reference-dataset",
  sourceVersion: "2026.09",
  sourceReleaseDate: "2026-09-01",
  licenseName: "Reference License",
  licenseReference: null,
  sourceReference: null,
  sourceChecksumSha256: "a".repeat(64),
  importerVersion: "plan4-reference-1",
  configChecksumSha256: "b".repeat(64)
};

function candidate(id: string): FoodCatalogCandidateInput {
  return {
    sourceRecordId: id,
    sourceReference: null,
    sourceRecordChecksumSha256: "c".repeat(64),
    canonicalName: `Food ${id}`,
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
      { locale: "de", value: `Alias B ${id}` },
      { locale: "en", value: `Alias A ${id}` }
    ],
    names: [
      { locale: "de", script: "Latn", role: "source", value: `Name B ${id}` },
      { locale: "en", script: "Latn", role: "source", value: `Name A ${id}` }
    ],
    identityEvidence: {
      semanticSignature: `sig:${id}`,
      preparation: null,
      state: null,
      form: null
    },
    servings: [
      {
        servingKey: "portion-b",
        amount: 2,
        unit: "piece",
        gramWeight: 20,
        milliliterVolume: null,
        label: "2 pieces",
        sourceEvidence: { ordinal: 2 }
      },
      {
        servingKey: "portion-a",
        amount: 1,
        unit: "piece",
        gramWeight: 10,
        milliliterVolume: null,
        label: "1 piece",
        sourceEvidence: { ordinal: 1 }
      }
    ],
    taxonomyEvidence: [
      { taxonomy: "reference", sourceCode: "B", mappedTaxonomyId: "tax-b" },
      { taxonomy: "reference", sourceCode: "A", mappedTaxonomyId: "tax-a" }
    ],
    gtins: [],
    marketScopes: [],
    globallyRelevant: false,
    sourceNutrition: null,
    sourceServing: null
  };
}

describe("Food Catalog Plan 4 ManifestContent determinism", () => {
  it("produces one checksum for 1,001 equivalent candidates independent of input and nested evidence ordering", () => {
    const inputs = Array.from({ length: 1001 }, (_, index) => candidate(String(index).padStart(4, "0")));
    const firstCandidates = inputs.map(normalizeCandidate);
    const secondCandidates = [...inputs]
      .reverse()
      .map((entry) => normalizeCandidate({
        ...entry,
        aliases: [...entry.aliases].reverse(),
        names: [...entry.names].reverse(),
        servings: [...entry.servings].reverse(),
        taxonomyEvidence: [...entry.taxonomyEvidence].reverse()
      }));

    const first = buildPlan4ManifestContent(source, firstCandidates);
    const second = buildPlan4ManifestContent(source, secondCandidates);

    expect(first.expectedMutations.input).toBe(1001);
    expect(checksumManifestContent(first)).toBe(checksumManifestContent(second));
  });
});
