import { describe, expect, it, vi } from "vitest";

import type { ControlPlaneActorContext } from "@/lib/food-catalog/domain/generations";
import type {
  StoredFoodMarketAssignment,
  StoredFoodNameFact,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";
import type {
  StoredActivationAuthority,
  StoredCatalogGeneration,
  StoredGenerationFood,
  StoredGenerationRedirect,
  StoredGenerationSelections,
} from "./generation-contracts";
import type {
  FoodCatalogGenerationCommandStore,
  FoodCatalogGenerationReadStore,
} from "./generation-store";
import { computeGenerationCompositionChecksum } from "./generation-builder";
import {
  GENERATION_BLOCKING_REASONS,
  persistGenerationValidation,
  validateStoredGeneration,
} from "./generation-validator";

const GENERATION_ID = "61000000-0000-4000-8000-000000000001";
const FOOD_A = "62000000-0000-4000-8000-000000000001";
const FOOD_B = "62000000-0000-4000-8000-000000000002";
const SOURCE_FOOD = "62000000-0000-4000-8000-000000000099";
const NAME_ID = "63000000-0000-4000-8000-000000000001";
const SERVING_ID = "64000000-0000-4000-8000-000000000001";
const TAXONOMY_ID = "65000000-0000-4000-8000-000000000001";
const MARKET_ID = "66000000-0000-4000-8000-000000000001";
const ASSERTION_ID = "67000000-0000-4000-8000-000000000001";
const ACTIVATION_SET_ID = "68000000-0000-4000-8000-000000000001";
const ACTIVATION_MEMBER_ID = "69000000-0000-4000-8000-000000000001";
const GRANT_ID = "6a000000-0000-4000-8000-000000000001";
const SEALED_AT = "2026-09-02T12:00:00.000Z";

const actor: ControlPlaneActorContext = {
  principalId: "validator-service",
  principalType: "service",
  authorityReference: "plan3-task7",
  reasonCode: "RECORD_VALIDATION",
  policyVersion: "control-v1",
};

function activeFood(): StoredGenerationFood {
  return {
    generationId: GENERATION_ID,
    foodId: FOOD_A,
    lifecycle: "active",
    nutritionRevisionId: null,
    activationSetId: ACTIVATION_SET_ID,
    activationSetMemberId: ACTIVATION_MEMBER_ID,
    activationGrantEventId: GRANT_ID,
  };
}

function deprecatedFood(): StoredGenerationFood {
  return {
    generationId: GENERATION_ID,
    foodId: FOOD_B,
    lifecycle: "deprecated",
    nutritionRevisionId: null,
    activationSetId: null,
    activationSetMemberId: null,
    activationGrantEventId: null,
  };
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

function preferredName(foodId = FOOD_A): StoredFoodNameFact {
  return {
    id: NAME_ID,
    foodId,
    languageTag: "en",
    role: "preferred_display",
    text: "Fixture Food",
    normalizedText: "fixture food",
    scriptCode: "Latn",
    origin: "curated",
    sourceRecordId: null,
    policyVersion: "name-v1",
    createdAt: "2026-09-02T10:00:00.000Z",
  };
}

function serving(foodId = FOOD_A): StoredFoodServingOption {
  return {
    id: SERVING_ID,
    foodId,
    label: "100 g",
    amount: 100,
    unitCode: "g",
    gramWeight: 100,
    sourceRecordId: "source-row",
    sourcePortionCode: "100g",
    evidenceClass: "exact_source",
    sourcePrimary: true,
    createdAt: "2026-09-02T10:00:00.000Z",
  };
}

function taxonomy(action: "assign" | "remove" = "assign"): StoredFoodTaxonomyAssignment {
  return {
    id: TAXONOMY_ID,
    foodId: FOOD_A,
    nodeCode: "protein_foods",
    sourceRecordId: "source-row",
    action,
    policyVersion: "taxonomy-v1",
    createdAt: "2026-09-02T10:00:00.000Z",
  };
}

function market(action: "assign" | "remove" = "assign"): StoredFoodMarketAssignment {
  return {
    id: MARKET_ID,
    foodId: FOOD_A,
    scopeCode: "DE",
    relevance: "primary",
    sourceRecordId: "source-row",
    action,
    policyVersion: "market-v1",
    createdAt: "2026-09-02T10:00:00.000Z",
  };
}

function verification(state: "verified" | "revoked" = "verified"): StoredFoodVerificationAssertion {
  return {
    id: ASSERTION_ID,
    foodId: FOOD_A,
    scope: "identity",
    state,
    policyVersion: "verification-v1",
    sourceRecordId: "source-row",
    supersedesAssertionId: null,
    reasonCode: state === "verified" ? "VERIFIED" : "REVOKED",
    authorityReference: "fixture",
    createdAt: "2026-09-02T10:00:00.000Z",
  };
}

function activation(invalidatedAt: string | null = null): StoredActivationAuthority {
  return {
    activationSetId: ACTIVATION_SET_ID,
    activationSetMemberId: ACTIVATION_MEMBER_ID,
    foodId: FOOD_A,
    activationPolicyVersion: "activation-v1",
    eligibility: "eligible",
    sourceLegalAccepted: true,
    grantEventId: GRANT_ID,
    grantCreatedAt: "2026-09-02T11:00:00.000Z",
    invalidatedAt,
  };
}

type Fixture = {
  foods: StoredGenerationFood[];
  redirects: StoredGenerationRedirect[];
  selections: Record<string, StoredGenerationSelections>;
  names: StoredFoodNameFact[];
  servings: StoredFoodServingOption[];
  taxonomy: StoredFoodTaxonomyAssignment[];
  markets: StoredFoodMarketAssignment[];
  verification: StoredFoodVerificationAssertion[];
  activation: StoredActivationAuthority | null;
};

function semanticComposition(fixture: Fixture) {
  return {
    compositionSchemaVersion: "composition-v1",
    generationPolicyVersion: "generation-v1",
    activationPolicyVersion: "activation-v1",
    trustPolicyVersion: "trust-v1",
    projectionVersion: "projection-v1",
    foods: fixture.foods.map(({ generationId: _generationId, ...food }) => food),
    servings: fixture.foods.flatMap((food) => (fixture.selections[food.foodId]?.servingOptionIds ?? []).map((servingOptionId) => ({ foodId: food.foodId, servingOptionId }))),
    names: fixture.foods.flatMap((food) => (fixture.selections[food.foodId]?.nameFactIds ?? []).map((nameFactId) => ({ foodId: food.foodId, nameFactId }))),
    taxonomy: fixture.foods.flatMap((food) => (fixture.selections[food.foodId]?.taxonomyAssignmentIds ?? []).map((assignmentId) => ({ foodId: food.foodId, assignmentId }))),
    markets: fixture.foods.flatMap((food) => (fixture.selections[food.foodId]?.marketAssignmentIds ?? []).map((assignmentId) => ({ foodId: food.foodId, assignmentId }))),
    verification: fixture.foods.flatMap((food) => fixture.selections[food.foodId]?.verification ?? []),
    redirects: fixture.redirects.map(({ generationId: _generationId, ...redirect }) => redirect),
  };
}

function baseFixture(): Fixture {
  return {
    foods: [activeFood()],
    redirects: [],
    selections: {
      [FOOD_A]: { ...emptySelections(), nameFactIds: [NAME_ID] },
    },
    names: [preferredName()],
    servings: [],
    taxonomy: [],
    markets: [],
    verification: [],
    activation: activation(),
  };
}

function makeReadStore(fixture: Fixture, checksumOverride?: string) {
  const checksum = checksumOverride ?? computeGenerationCompositionChecksum(semanticComposition(fixture));
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
    authorityReference: "fixture",
    createdAt: "2026-09-02T11:59:00.000Z",
    sealedAt: SEALED_AT,
  };

  const store = {
    readCurrentPointer: vi.fn(),
    readGeneration: vi.fn(async () => generation),
    readGenerationFoods: vi.fn(async () => fixture.foods),
    readGenerationFood: vi.fn(async (_generationId: string, foodId: string) => fixture.foods.find((food) => food.foodId === foodId) ?? null),
    readGenerationRedirects: vi.fn(async () => fixture.redirects),
    readGenerationRedirect: vi.fn(async (_generationId: string, sourceFoodId: string) => fixture.redirects.find((redirect) => redirect.sourceFoodId === sourceFoodId) ?? null),
    readGenerationSelections: vi.fn(async (_generationId: string, foodId: string) => fixture.selections[foodId] ?? emptySelections()),
    readNutritionRevision: vi.fn(async () => null),
    readServingOptions: vi.fn(async (_foodId: string, ids: readonly string[]) => fixture.servings.filter((row) => ids.includes(row.id))),
    readNames: vi.fn(async (_foodId: string, ids: readonly string[]) => fixture.names.filter((row) => ids.includes(row.id))),
    readTaxonomyAssignments: vi.fn(async (_foodId: string, ids: readonly string[]) => fixture.taxonomy.filter((row) => ids.includes(row.id))),
    readMarketAssignments: vi.fn(async (_foodId: string, ids: readonly string[]) => fixture.markets.filter((row) => ids.includes(row.id))),
    readVerificationAssertions: vi.fn(async (_foodId: string, selections: ReadonlyArray<{ assertionId: string }>) => fixture.verification.filter((row) => selections.some((selection) => selection.assertionId === row.id))),
    readActivationAuthority: vi.fn(async () => fixture.activation),
    readGenerationEvent: vi.fn(),
    readValidationReport: vi.fn(),
    readValidationFindings: vi.fn(),
  };
  return { store: store as unknown as FoodCatalogGenerationReadStore, raw: store, generation };
}

function reasons(report: Awaited<ReturnType<typeof validateStoredGeneration>>) {
  return report.findings.map((finding) => finding.reasonCode);
}

describe("Food Catalog Plan 3 deterministic generation validator", () => {
  it("exposes the exact binding blocker vocabulary", () => {
    expect(GENERATION_BLOCKING_REASONS).toEqual([
      "GENERATION_CHECKSUM_MISMATCH",
      "ACTIVE_FOOD_MISSING_ACTIVATION_GRANT",
      "ACTIVE_FOOD_MISSING_DISPLAY_NAME",
      "SELECTED_FACT_MISSING",
      "SELECTED_FACT_CROSS_FOOD",
      "SELECTED_TAXONOMY_REMOVAL",
      "SELECTED_MARKET_REMOVAL",
      "INVALID_VERIFICATION_SELECTION",
      "REDIRECT_TARGET_NOT_ACTIVE",
      "REDIRECT_CHAIN",
    ]);
  });

  it("recomputes stored composition and blocks an exact checksum mismatch", async () => {
    const fixture = baseFixture();
    const expected = computeGenerationCompositionChecksum(semanticComposition(fixture));
    const { store } = makeReadStore(fixture);

    const report = await validateStoredGeneration(store, GENERATION_ID, "f".repeat(64));
    expect(reasons(report)).toContain("GENERATION_CHECKSUM_MISMATCH");
    expect(report.generationChecksumSha256).toBe(expected);
  });

  it("blocks an active Food without a selected preferred display name", async () => {
    const fixture = baseFixture();
    fixture.selections[FOOD_A] = emptySelections();
    fixture.names = [];
    const checksum = computeGenerationCompositionChecksum(semanticComposition(fixture));

    const report = await validateStoredGeneration(makeReadStore(fixture).store, GENERATION_ID, checksum);
    expect(reasons(report)).toContain("ACTIVE_FOOD_MISSING_DISPLAY_NAME");
  });

  it("distinguishes missing selected facts from returned cross-Food facts", async () => {
    const missing = baseFixture();
    missing.selections[FOOD_A] = { ...missing.selections[FOOD_A], servingOptionIds: [SERVING_ID] };
    const missingChecksum = computeGenerationCompositionChecksum(semanticComposition(missing));
    const missingReport = await validateStoredGeneration(makeReadStore(missing).store, GENERATION_ID, missingChecksum);
    expect(reasons(missingReport)).toContain("SELECTED_FACT_MISSING");

    const crossFood = baseFixture();
    crossFood.selections[FOOD_A] = { ...crossFood.selections[FOOD_A], servingOptionIds: [SERVING_ID] };
    crossFood.servings = [serving(FOOD_B)];
    const crossChecksum = computeGenerationCompositionChecksum(semanticComposition(crossFood));
    const crossReport = await validateStoredGeneration(makeReadStore(crossFood).store, GENERATION_ID, crossChecksum);
    expect(reasons(crossReport)).toContain("SELECTED_FACT_CROSS_FOOD");
  });

  it("blocks selected taxonomy and market removal facts", async () => {
    const fixture = baseFixture();
    fixture.selections[FOOD_A] = {
      ...fixture.selections[FOOD_A],
      taxonomyAssignmentIds: [TAXONOMY_ID],
      marketAssignmentIds: [MARKET_ID],
    };
    fixture.taxonomy = [taxonomy("remove")];
    fixture.markets = [market("remove")];
    const checksum = computeGenerationCompositionChecksum(semanticComposition(fixture));

    const report = await validateStoredGeneration(makeReadStore(fixture).store, GENERATION_ID, checksum);
    expect(reasons(report)).toContain("SELECTED_TAXONOMY_REMOVAL");
    expect(reasons(report)).toContain("SELECTED_MARKET_REMOVAL");
  });

  it("accepts a selected revoked assertion as valid evidence without treating the scope as verified", async () => {
    const fixture = baseFixture();
    fixture.selections[FOOD_A] = {
      ...fixture.selections[FOOD_A],
      verification: [{ foodId: FOOD_A, scope: "identity", assertionId: ASSERTION_ID }],
    };
    fixture.verification = [verification("revoked")];
    const checksum = computeGenerationCompositionChecksum(semanticComposition(fixture));

    const report = await validateStoredGeneration(makeReadStore(fixture).store, GENERATION_ID, checksum);
    expect(reasons(report)).not.toContain("INVALID_VERIFICATION_SELECTION");
    expect(report.verificationStates).toEqual(expect.arrayContaining([
      { foodId: FOOD_A, scope: "identity", assertionId: ASSERTION_ID, state: "revoked" },
    ]));
  });

  it("blocks redirects whose target is not active and detects redirect chains", async () => {
    const fixture = baseFixture();
    fixture.foods = [activeFood(), deprecatedFood()];
    fixture.selections[FOOD_B] = emptySelections();
    fixture.redirects = [
      { generationId: GENERATION_ID, sourceFoodId: SOURCE_FOOD, targetFoodId: FOOD_B },
      { generationId: GENERATION_ID, sourceFoodId: FOOD_B, targetFoodId: FOOD_A },
    ];
    const checksum = computeGenerationCompositionChecksum(semanticComposition(fixture));

    const report = await validateStoredGeneration(makeReadStore(fixture).store, GENERATION_ID, checksum);
    expect(reasons(report)).toContain("REDIRECT_TARGET_NOT_ACTIVE");
    expect(reasons(report)).toContain("REDIRECT_CHAIN");
  });

  it("uses generation sealedAt for activation invalidation non-retroactivity", async () => {
    const blockedFixture = baseFixture();
    blockedFixture.activation = activation("2026-09-02T12:00:00.000Z");
    const blockedChecksum = computeGenerationCompositionChecksum(semanticComposition(blockedFixture));
    const blocked = await validateStoredGeneration(makeReadStore(blockedFixture).store, GENERATION_ID, blockedChecksum);
    expect(reasons(blocked)).toContain("ACTIVE_FOOD_MISSING_ACTIVATION_GRANT");

    const historicalFixture = baseFixture();
    historicalFixture.activation = activation("2026-09-02T12:00:00.001Z");
    const historicalChecksum = computeGenerationCompositionChecksum(semanticComposition(historicalFixture));
    const historical = await validateStoredGeneration(makeReadStore(historicalFixture).store, GENERATION_ID, historicalChecksum);
    expect(reasons(historical)).not.toContain("ACTIVE_FOOD_MISSING_ACTIVATION_GRANT");
  });

  it("sorts findings and computes the report checksum deterministically", async () => {
    const fixture = baseFixture();
    fixture.selections[FOOD_A] = {
      ...emptySelections(),
      servingOptionIds: [SERVING_ID],
      taxonomyAssignmentIds: [TAXONOMY_ID],
      marketAssignmentIds: [MARKET_ID],
    };
    fixture.taxonomy = [taxonomy("remove")];
    fixture.markets = [market("remove")];
    fixture.activation = null;
    const checksum = computeGenerationCompositionChecksum(semanticComposition(fixture));

    const first = await validateStoredGeneration(makeReadStore(fixture).store, GENERATION_ID, checksum);
    const secondFixture = { ...fixture, foods: [...fixture.foods].reverse(), redirects: [...fixture.redirects].reverse() };
    const second = await validateStoredGeneration(makeReadStore(secondFixture).store, GENERATION_ID, checksum);

    expect(first.reportChecksumSha256).toBe(second.reportChecksumSha256);
    expect(first.findings.map(({ id: _id, ...finding }) => finding)).toEqual(
      second.findings.map(({ id: _id, ...finding }) => finding),
    );
  });

  it("persists the exact immutable report through recordValidation", async () => {
    const fixture = baseFixture();
    const checksum = computeGenerationCompositionChecksum(semanticComposition(fixture));
    const report = await validateStoredGeneration(makeReadStore(fixture).store, GENERATION_ID, checksum);
    const recordValidation = vi.fn().mockResolvedValue({
      operationId: "task7-op",
      eventId: "6b000000-0000-4000-8000-000000000001",
      generationId: GENERATION_ID,
      validationReportId: report.id,
      pointerRevision: null,
    });
    const commandStore = { recordValidation } as unknown as FoodCatalogGenerationCommandStore;

    await persistGenerationValidation(commandStore, report, actor, "task7-op");

    expect(recordValidation).toHaveBeenCalledTimes(1);
    const command = recordValidation.mock.calls[0][0];
    expect(command.operationId).toBe("task7-op");
    expect(command.commandChecksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(command.payload).toEqual(expect.objectContaining({
      report_id: report.id,
      generation_id: GENERATION_ID,
      generation_checksum_sha256: checksum,
      validator_set_version: report.validatorSetVersion,
      policy_version: report.policyVersion,
      report_checksum_sha256: report.reportChecksumSha256,
      blocker_count: report.blockerCount,
    }));
    expect(command.payload).not.toHaveProperty("valid");
  });
});
