import { describe, expect, it, vi } from "vitest";

import type { FoodCatalogGenerationReadStore } from "./generation-store";
import type {
  StoredCatalogGeneration,
  StoredGenerationFood,
  StoredGenerationSelections,
} from "./generation-contracts";
import type {
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodVerificationAssertion,
} from "./contracts";
import { FoodCatalogGenerationError } from "./generation-errors";
import {
  getCurrentGenerationFood,
  projectCurrentGenerationCompatibility,
  resolveCurrentGenerationFoodForNewUse,
} from "./current-generation-service";

const GENERATION_ID = "91000000-0000-4000-8000-000000000001";
const EVENT_ID = "92000000-0000-4000-8000-000000000001";
const REPORT_ID = "93000000-0000-4000-8000-000000000001";
const WRONG_REPORT_ID = "93000000-0000-4000-8000-000000000002";
const FOOD_ID = "94000000-0000-4000-8000-000000000001";
const OLD_FOOD_ID = "94000000-0000-4000-8000-000000000002";
const NEXT_FOOD_ID = "94000000-0000-4000-8000-000000000003";
const NUTRITION_ID = "95000000-0000-4000-8000-000000000001";
const NEWER_NUTRITION_ID = "95000000-0000-4000-8000-000000000002";
const NAME_ID = "96000000-0000-4000-8000-000000000001";
const OTHER_NAME_ID = "96000000-0000-4000-8000-000000000002";
const SERVING_ID = "97000000-0000-4000-8000-000000000001";
const OTHER_SERVING_ID = "97000000-0000-4000-8000-000000000002";
const IDENTITY_ASSERTION_ID = "98000000-0000-4000-8000-000000000001";
const NUTRITION_ASSERTION_ID = "98000000-0000-4000-8000-000000000002";
const NEWER_ASSERTION_ID = "98000000-0000-4000-8000-000000000003";
const ACTIVATION_SET_ID = "99000000-0000-4000-8000-000000000001";
const ACTIVATION_MEMBER_ID = "9a000000-0000-4000-8000-000000000001";
const ACTIVATION_GRANT_ID = "9b000000-0000-4000-8000-000000000001";
const SHA = "a".repeat(64);

const generation: StoredCatalogGeneration = {
  id: GENERATION_ID,
  baseGenerationId: null,
  generationOrdinal: 1,
  compositionSchemaVersion: "composition-v1",
  generationPolicyVersion: "generation-v1",
  activationPolicyVersion: "activation-v1",
  trustPolicyVersion: "trust-v1",
  projectionVersion: "projection-v1",
  changeManifestChecksumSha256: "b".repeat(64),
  compositionChecksumSha256: SHA,
  authorityReference: "generation-authority",
  createdAt: "2026-09-02T09:59:00.000Z",
  sealedAt: "2026-09-02T10:00:00.000Z",
};

const activeFood: StoredGenerationFood = {
  generationId: GENERATION_ID,
  foodId: FOOD_ID,
  lifecycle: "active",
  nutritionRevisionId: NUTRITION_ID,
  activationSetId: ACTIVATION_SET_ID,
  activationSetMemberId: ACTIVATION_MEMBER_ID,
  activationGrantEventId: ACTIVATION_GRANT_ID,
};

const selections: StoredGenerationSelections = {
  servingOptionIds: [SERVING_ID],
  nameFactIds: [NAME_ID],
  taxonomyAssignmentIds: [],
  marketAssignmentIds: [],
  verification: [
    { foodId: FOOD_ID, scope: "identity", assertionId: IDENTITY_ASSERTION_ID },
    { foodId: FOOD_ID, scope: "nutrition", assertionId: NUTRITION_ASSERTION_ID },
  ],
};

const nutrition: StoredFoodNutritionRevision = {
  id: NUTRITION_ID,
  createdAt: "2026-09-02T09:00:00.000Z",
  foodId: FOOD_ID,
  revisionNumber: 1,
  calories: 0,
  protein_g: null,
  carbs_g: 20,
  fat_g: 2,
  saturated_fat_g: null,
  fiber_g: null,
  sugars_g: null,
  sodium_mg: null,
  basisAmount: 100,
  basisUnit: "g",
  nutrientMappingVersion: "map-v1",
  sourceRecordId: null,
};

const name: StoredFoodNameFact = {
  id: NAME_ID,
  createdAt: "2026-09-02T09:00:00.000Z",
  foodId: FOOD_ID,
  languageTag: "en",
  role: "preferred_display",
  text: "Exact Food",
  normalizedText: "exact food",
  scriptCode: "Latn",
  origin: "curated",
  sourceRecordId: null,
  policyVersion: "name-v1",
};

const serving: StoredFoodServingOption = {
  id: SERVING_ID,
  createdAt: "2026-09-02T09:00:00.000Z",
  foodId: FOOD_ID,
  label: "100 g",
  amount: 100,
  unitCode: "g",
  gramWeight: null,
  sourceRecordId: null,
  sourcePortionCode: null,
  evidenceClass: "exact_source",
  sourcePrimary: true,
};

function assertions(identityState: "verified" | "revoked" = "verified"): StoredFoodVerificationAssertion[] {
  return [
    {
      id: IDENTITY_ASSERTION_ID,
      createdAt: "2026-09-02T09:00:00.000Z",
      foodId: FOOD_ID,
      scope: "identity",
      state: identityState,
      policyVersion: "verification-v1",
      sourceRecordId: null,
      supersedesAssertionId: null,
      reasonCode: "selected",
      authorityReference: "selected-authority",
    },
    {
      id: NUTRITION_ASSERTION_ID,
      createdAt: "2026-09-02T09:00:00.000Z",
      foodId: FOOD_ID,
      scope: "nutrition",
      state: "verified",
      policyVersion: "verification-v1",
      sourceRecordId: null,
      supersedesAssertionId: null,
      reasonCode: "selected",
      authorityReference: "selected-authority",
    },
  ];
}

function makeStore(overrides: Partial<FoodCatalogGenerationReadStore> = {}): FoodCatalogGenerationReadStore {
  const store: FoodCatalogGenerationReadStore = {
    readCurrentPointer: vi.fn(async () => ({
      currentGenerationId: GENERATION_ID,
      currentEventId: EVENT_ID,
      currentValidationReportId: REPORT_ID,
      pointerRevision: 3,
    })),
    readGeneration: vi.fn(async () => generation),
    readGenerationFood: vi.fn(async (_generationId: string, foodId: string) => foodId === FOOD_ID ? activeFood : null),
    readGenerationRedirect: vi.fn(async () => null),
    readGenerationSelections: vi.fn(async () => selections),
    readNutritionRevision: vi.fn(async () => nutrition),
    readServingOptions: vi.fn(async () => [serving]),
    readNames: vi.fn(async () => [name]),
    readTaxonomyAssignments: vi.fn(async () => []),
    readMarketAssignments: vi.fn(async () => []),
    readVerificationAssertions: vi.fn(async () => assertions()),
    readActivationAuthority: vi.fn(async () => ({
      activationSetId: ACTIVATION_SET_ID,
      activationSetMemberId: ACTIVATION_MEMBER_ID,
      foodId: FOOD_ID,
      activationPolicyVersion: "activation-v1",
      eligibility: "eligible",
      sourceLegalAccepted: true,
      grantEventId: ACTIVATION_GRANT_ID,
      grantCreatedAt: "2026-09-02T09:30:00.000Z",
      invalidatedAt: null,
    })),
    readGenerationEvent: vi.fn(async () => ({
      id: EVENT_ID,
      operationId: "9c000000-0000-4000-8000-000000000001",
      eventType: "rollback",
      fromGenerationId: "91000000-0000-4000-8000-000000000009",
      toGenerationId: GENERATION_ID,
      revokedGenerationId: null,
      generationChecksumSha256: SHA,
      validationReportId: WRONG_REPORT_ID,
      actor: {
        principalId: "operator",
        principalType: "service",
        authorityReference: "rollback-authority",
        reasonCode: "rollback",
        policyVersion: "control-v1",
      },
      reasonCode: "rollback",
      authorityReference: "rollback-authority",
      policyVersion: "control-v1",
      createdAt: "2026-09-02T10:30:00.000Z",
    })),
    readValidationReport: vi.fn(async (reportId: string) => reportId === REPORT_ID ? {
      id: REPORT_ID,
      generationId: GENERATION_ID,
      generationChecksumSha256: SHA,
      validatorSetVersion: "validator-v1",
      policyVersion: "validation-v1",
      reportChecksumSha256: "c".repeat(64),
      blockerCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      createdAt: "2026-09-02T10:05:00.000Z",
    } : null),
    readValidationFindings: vi.fn(async () => []),
  };
  return Object.assign(store, overrides);
}

function expectGenerationError(code: string) {
  return (error: unknown) => error instanceof FoodCatalogGenerationError && error.code === code;
}

describe("Food Catalog Plan 3 exact current-generation service", () => {
  it("rejects a null current pointer without touching generation or legacy/raw fact reads", async () => {
    const store = makeStore({
      readCurrentPointer: vi.fn(async () => ({
        currentGenerationId: null,
        currentEventId: null,
        currentValidationReportId: null,
        pointerRevision: 0,
      })),
    });

    await expect(getCurrentGenerationFood(store, FOOD_ID)).rejects.toSatisfy(expectGenerationError("NO_CURRENT_GENERATION"));
    expect(store.readGeneration).not.toHaveBeenCalled();
    expect(store.readNutritionRevision).not.toHaveBeenCalled();
    expect(store.readNames).not.toHaveBeenCalled();
  });

  it("rejects a partially populated singleton pointer as malformed current authority", async () => {
    const store = makeStore({
      readCurrentPointer: vi.fn(async () => ({
        currentGenerationId: GENERATION_ID,
        currentEventId: EVENT_ID,
        currentValidationReportId: null,
        pointerRevision: 4,
      })),
    });

    await expect(getCurrentGenerationFood(store, FOOD_ID)).rejects.toSatisfy(expectGenerationError("CONTROL_PLANE_REJECTED"));
    expect(store.readGeneration).not.toHaveBeenCalled();
  });

  it("hydrates only the exact generation row and selected fact IDs, preserving zero and null", async () => {
    const store = makeStore();
    const view = await getCurrentGenerationFood(store, FOOD_ID);

    expect(view.requestedFoodId).toBe(FOOD_ID);
    expect(view.resolvedFoodId).toBe(FOOD_ID);
    expect(view.generation.id).toBe(GENERATION_ID);
    expect(view.food).toEqual(activeFood);
    expect(view.redirect).toBeNull();
    expect(view.nutritionRevision?.calories).toBe(0);
    expect(view.nutritionRevision?.protein_g).toBeNull();
    expect(store.readGenerationFood).toHaveBeenCalledWith(GENERATION_ID, FOOD_ID);
    expect(store.readNutritionRevision).toHaveBeenCalledWith(FOOD_ID, NUTRITION_ID);
    expect(store.readNames).toHaveBeenCalledWith(FOOD_ID, [NAME_ID]);
    expect(store.readServingOptions).toHaveBeenCalledWith(FOOD_ID, [SERVING_ID]);
    expect(store.readVerificationAssertions).toHaveBeenCalledWith(FOOD_ID, selections.verification);
    expect(store.readNutritionRevision).not.toHaveBeenCalledWith(FOOD_ID, NEWER_NUTRITION_ID);
  });

  it("resolves one direct redirect to an active survivor and rejects redirect chains or non-active targets", async () => {
    const redirectedStore = makeStore({
      readGenerationFood: vi.fn(async (_generationId: string, foodId: string) => foodId === FOOD_ID ? activeFood : null),
      readGenerationRedirect: vi.fn(async (_generationId: string, sourceFoodId: string) => {
        if (sourceFoodId === OLD_FOOD_ID) return { generationId: GENERATION_ID, sourceFoodId: OLD_FOOD_ID, targetFoodId: FOOD_ID };
        return null;
      }),
    });
    const redirected = await getCurrentGenerationFood(redirectedStore, OLD_FOOD_ID);
    expect(redirected.requestedFoodId).toBe(OLD_FOOD_ID);
    expect(redirected.resolvedFoodId).toBe(FOOD_ID);
    expect(redirected.redirect?.targetFoodId).toBe(FOOD_ID);
    expect(redirectedStore.readGenerationRedirect).toHaveBeenCalledWith(GENERATION_ID, FOOD_ID);

    const chainStore = makeStore({
      readGenerationFood: vi.fn(async (_generationId: string, foodId: string) => {
        if (foodId === FOOD_ID) return activeFood;
        if (foodId === NEXT_FOOD_ID) return { ...activeFood, foodId: NEXT_FOOD_ID };
        return null;
      }),
      readGenerationRedirect: vi.fn(async (_generationId: string, sourceFoodId: string) => {
        if (sourceFoodId === OLD_FOOD_ID) return { generationId: GENERATION_ID, sourceFoodId: OLD_FOOD_ID, targetFoodId: FOOD_ID };
        if (sourceFoodId === FOOD_ID) return { generationId: GENERATION_ID, sourceFoodId: FOOD_ID, targetFoodId: NEXT_FOOD_ID };
        return null;
      }),
    });
    await expect(getCurrentGenerationFood(chainStore, OLD_FOOD_ID)).rejects.toSatisfy(expectGenerationError("INVALID_REDIRECT"));

    const nonActiveStore = makeStore({
      readGenerationFood: vi.fn(async (_generationId: string, foodId: string) => foodId === FOOD_ID ? { ...activeFood, lifecycle: "deprecated" as const, activationSetId: null, activationSetMemberId: null, activationGrantEventId: null } : null),
      readGenerationRedirect: vi.fn(async (_generationId: string, sourceFoodId: string) => sourceFoodId === OLD_FOOD_ID
        ? { generationId: GENERATION_ID, sourceFoodId: OLD_FOOD_ID, targetFoodId: FOOD_ID }
        : null),
    });
    await expect(getCurrentGenerationFood(nonActiveStore, OLD_FOOD_ID)).rejects.toSatisfy(expectGenerationError("INVALID_REDIRECT"));
  });

  it("derives trust only from selected assertions and the pointer-bound validation report", async () => {
    const store = makeStore({
      readVerificationAssertions: vi.fn(async (_foodId: string, selected) => {
        expect(selected.map((item) => item.assertionId)).not.toContain(NEWER_ASSERTION_ID);
        return assertions();
      }),
    });
    const view = await getCurrentGenerationFood(store, FOOD_ID);

    expect(view.trust.verification.identity).toBe("verified");
    expect(view.trust.verification.nutrition).toBe("verified");
    expect(view.trust.verification.serving).toBe("missing");
    expect(view.trust.verified).toBe(true);
    expect(store.readValidationReport).toHaveBeenCalledWith(REPORT_ID);
    expect(store.readValidationReport).not.toHaveBeenCalledWith(WRONG_REPORT_ID);
    expect(view.currentEvent.eventType).toBe("rollback");
    expect(view.validationReport.id).toBe(REPORT_ID);
  });

  it("maps a selected revoked assertion to an unverified Trust component while serving missing alone remains compatible", async () => {
    const revoked = await getCurrentGenerationFood(makeStore({
      readVerificationAssertions: vi.fn(async () => assertions("revoked")),
    }), FOOD_ID);
    expect(revoked.trust.verification.identity).toBe("revoked");
    expect(revoked.trust.verified).toBe(false);

    const servingMissing = await getCurrentGenerationFood(makeStore(), FOOD_ID);
    expect(servingMissing.trust.verification.serving).toBe("missing");
    expect(servingMissing.trust.verified).toBe(true);
  });

  it("rejects pointer-bound validation reports that do not bind the exact current generation/checksum", async () => {
    const store = makeStore({
      readValidationReport: vi.fn(async () => ({
        id: REPORT_ID,
        generationId: GENERATION_ID,
        generationChecksumSha256: "d".repeat(64),
        validatorSetVersion: "validator-v1",
        policyVersion: "validation-v1",
        reportChecksumSha256: "c".repeat(64),
        blockerCount: 0,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        createdAt: "2026-09-02T10:05:00.000Z",
      })),
    });
    await expect(getCurrentGenerationFood(store, FOOD_ID)).rejects.toSatisfy(expectGenerationError("VALIDATION_REPORT_MISMATCH"));
  });

  it("compatibility projection accepts only selected name/serving IDs and preserves null versus zero", async () => {
    const view = await getCurrentGenerationFood(makeStore(), FOOD_ID);
    const projected = projectCurrentGenerationCompatibility(view, {
      nameFactId: NAME_ID,
      servingOptionId: SERVING_ID,
    });
    expect(projected.id).toBe(FOOD_ID);
    expect(projected.nutrition.calories).toBe(0);
    expect(projected.nutrition.protein_g).toBeNull();

    expect(() => projectCurrentGenerationCompatibility(view, {
      nameFactId: OTHER_NAME_ID,
      servingOptionId: SERVING_ID,
    })).toThrow(/selected/i);
    expect(() => projectCurrentGenerationCompatibility(view, {
      nameFactId: NAME_ID,
      servingOptionId: OTHER_SERVING_ID,
    })).toThrow(/selected/i);
  });

  it("allows deprecated/withdrawn diagnostic current views but rejects them for new use", async () => {
    const deprecatedFood: StoredGenerationFood = {
      ...activeFood,
      lifecycle: "deprecated",
      activationSetId: null,
      activationSetMemberId: null,
      activationGrantEventId: null,
    };
    const store = makeStore({
      readGenerationFood: vi.fn(async () => deprecatedFood),
      readActivationAuthority: vi.fn(async () => null),
    });

    const diagnostic = await getCurrentGenerationFood(store, FOOD_ID);
    expect(diagnostic.food.lifecycle).toBe("deprecated");
    expect(diagnostic.trust.verified).toBe(false);
    await expect(resolveCurrentGenerationFoodForNewUse(store, FOOD_ID)).rejects.toSatisfy(expectGenerationError("CONTROL_PLANE_REJECTED"));
  });
});
