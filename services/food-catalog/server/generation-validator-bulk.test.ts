import { describe, expect, it, vi } from "vitest";

import type { StoredCatalogGeneration, StoredGenerationFood, StoredGenerationSelections } from "./generation-contracts";
import type { FoodCatalogGenerationReadStore } from "./generation-store";
import { computeGenerationCompositionChecksum } from "./generation-builder";
import { validateStoredGeneration } from "./generation-validator";

const GENERATION_ID = "71000000-0000-4000-8000-000000000001";

function foodId(index: number) {
  return `72000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function emptySelections(): StoredGenerationSelections {
  return {
    servingOptionIds: [],
    nameFactIds: [],
    taxonomyAssignmentIds: [],
    marketAssignmentIds: [],
    verification: [],
  };
}

describe("Food Catalog Plan 3 bulk generation validation hydration", () => {
  it("hydrates a USDA-scale generation without per-Food selection/fact reads", async () => {
    const foods: StoredGenerationFood[] = Array.from({ length: 1001 }, (_, index) => ({
      generationId: GENERATION_ID,
      foodId: foodId(index + 1),
      lifecycle: "deprecated" as const,
      nutritionRevisionId: null,
      activationSetId: null,
      activationSetMemberId: null,
      activationGrantEventId: null,
    }));
    const selectionsByFoodId = Object.fromEntries(foods.map((food) => [food.foodId, emptySelections()]));
    const checksum = computeGenerationCompositionChecksum({
      compositionSchemaVersion: "composition-v1",
      generationPolicyVersion: "generation-v1",
      activationPolicyVersion: "activation-v1",
      trustPolicyVersion: "trust-v1",
      projectionVersion: "projection-v1",
      foods: foods.map(({ generationId: _generationId, ...food }) => food),
      servings: [],
      names: [],
      taxonomy: [],
      markets: [],
      verification: [],
      redirects: [],
    });
    const generation: StoredCatalogGeneration = {
      id: GENERATION_ID,
      baseGenerationId: null,
      generationOrdinal: 1,
      compositionSchemaVersion: "composition-v1",
      generationPolicyVersion: "generation-v1",
      activationPolicyVersion: "activation-v1",
      trustPolicyVersion: "trust-v1",
      projectionVersion: "projection-v1",
      changeManifestChecksumSha256: "a".repeat(64),
      compositionChecksumSha256: checksum,
      authorityReference: "bulk-validation-red",
      createdAt: "2026-09-02T10:00:00.000Z",
      sealedAt: "2026-09-02T11:00:00.000Z",
    };
    const readGenerationValidationHydration = vi.fn(async () => ({
      selectionsByFoodId,
      nutritionRevisions: [],
      servingOptions: [],
      names: [],
      taxonomyAssignments: [],
      marketAssignments: [],
      verificationAssertions: [],
      activationAuthorities: [],
    }));
    const nPlusOne = vi.fn(async () => {
      throw new Error("per-Food validation hydration must not execute");
    });
    const store = {
      readCurrentPointer: vi.fn(),
      readGeneration: vi.fn(async () => generation),
      readGenerationFoods: vi.fn(async () => foods),
      readGenerationFood: vi.fn(),
      readGenerationRedirects: vi.fn(async () => []),
      readGenerationRedirect: vi.fn(),
      readGenerationValidationHydration,
      readGenerationSelections: nPlusOne,
      readNutritionRevision: nPlusOne,
      readServingOptions: nPlusOne,
      readNames: nPlusOne,
      readTaxonomyAssignments: nPlusOne,
      readMarketAssignments: nPlusOne,
      readVerificationAssertions: nPlusOne,
      readActivationAuthority: nPlusOne,
      readGenerationEvent: vi.fn(),
      readValidationReport: vi.fn(),
      readValidationFindings: vi.fn(),
    } as unknown as FoodCatalogGenerationReadStore;

    const report = await validateStoredGeneration(store, GENERATION_ID, checksum);

    expect(report.blockerCount).toBe(0);
    expect(readGenerationValidationHydration).toHaveBeenCalledTimes(1);
    expect(nPlusOne).not.toHaveBeenCalled();
  });
});
