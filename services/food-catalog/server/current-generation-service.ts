import "server-only";

import {
  deriveFoodTrustProfile,
  type FoodTrustProfile,
  type FoodTrustVerification,
} from "@/lib/food-catalog/domain/trust";
import type { FoodVerificationScope } from "@/lib/food-catalog/domain/verification";

import {
  projectFoodCatalogCompatibility,
  type FoodCatalogCompatibilitySelection,
} from "./compatibility-projection";
import type {
  StoredFoodMarketAssignment,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
  ResolvedCatalogFood,
} from "./contracts";
import type {
  StoredActivationAuthority,
  StoredCatalogGeneration,
  StoredCurrentGenerationPointer,
  StoredGenerationEvent,
  StoredGenerationFood,
  StoredGenerationRedirect,
  StoredGenerationSelections,
  StoredGenerationValidationFinding,
  StoredGenerationValidationReport,
} from "./generation-contracts";
import { FoodCatalogGenerationError, type FoodCatalogGenerationErrorCode } from "./generation-errors";
import type { FoodCatalogGenerationReadStore } from "./generation-store";

const VERIFICATION_SCOPES: readonly FoodVerificationScope[] = [
  "identity",
  "nutrition",
  "serving",
  "barcode",
  "localization",
];

const NUTRIENT_KEYS = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "saturated_fat_g",
  "fiber_g",
  "sugars_g",
  "sodium_mg",
] as const satisfies readonly (keyof StoredFoodNutritionRevision)[];

type StoredFoodFact = { id: string; foodId: string };

export type CurrentGenerationFoodView = {
  pointer: StoredCurrentGenerationPointer;
  generation: StoredCatalogGeneration;
  currentEvent: StoredGenerationEvent;
  validationReport: StoredGenerationValidationReport;
  validationFindings: StoredGenerationValidationFinding[];
  requestedFoodId: string;
  resolvedFoodId: string;
  food: StoredGenerationFood;
  redirect: StoredGenerationRedirect | null;
  selections: StoredGenerationSelections;
  nutritionRevision: StoredFoodNutritionRevision | null;
  servingOptions: StoredFoodServingOption[];
  names: StoredFoodNameFact[];
  taxonomyAssignments: StoredFoodTaxonomyAssignment[];
  marketAssignments: StoredFoodMarketAssignment[];
  verificationAssertions: StoredFoodVerificationAssertion[];
  activationAuthority: StoredActivationAuthority | null;
  trust: FoodTrustProfile;
};

export type CurrentGenerationCompatibilitySelection = {
  nameFactId: string;
  servingOptionId: string | null;
};

function reject(code: FoodCatalogGenerationErrorCode, message: string): never {
  throw new FoodCatalogGenerationError(code, message);
}

function assertExactFacts(
  label: string,
  foodId: string,
  expectedIds: readonly string[],
  actual: readonly StoredFoodFact[],
): void {
  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length) {
    reject("CONTROL_PLANE_REJECTED", `${label} selection contains duplicate IDs.`);
  }
  if (actual.length !== expected.size) {
    reject("CONTROL_PLANE_REJECTED", `${label} selection did not resolve exactly.`);
  }

  const seen = new Set<string>();
  for (const fact of actual) {
    if (fact.foodId !== foodId) {
      reject("CROSS_FOOD_SELECTION", `${label} selection crossed Food identity.`);
    }
    if (!expected.has(fact.id) || seen.has(fact.id)) {
      reject("CONTROL_PLANE_REJECTED", `${label} selection returned an unselected or duplicate fact.`);
    }
    seen.add(fact.id);
  }

  if (seen.size !== expected.size) {
    reject("CONTROL_PLANE_REJECTED", `${label} selection is incomplete.`);
  }
}

function assertCurrentPointer(pointer: StoredCurrentGenerationPointer): asserts pointer is StoredCurrentGenerationPointer & {
  currentGenerationId: string;
  currentEventId: string;
  currentValidationReportId: string;
} {
  const allNull = pointer.currentGenerationId === null
    && pointer.currentEventId === null
    && pointer.currentValidationReportId === null;
  if (allNull) reject("NO_CURRENT_GENERATION", "Food Catalog has no current promoted generation.");

  if (
    pointer.currentGenerationId === null
    || pointer.currentEventId === null
    || pointer.currentValidationReportId === null
  ) {
    reject("CONTROL_PLANE_REJECTED", "Current generation pointer authority is partially populated.");
  }
}

function assertGenerationCurrentEvent(
  event: StoredGenerationEvent | null,
  eventId: string,
  generation: StoredCatalogGeneration,
): StoredGenerationEvent {
  if (
    event === null
    || event.id !== eventId
    || (event.eventType !== "promote" && event.eventType !== "rollback")
    || event.toGenerationId !== generation.id
    || event.generationChecksumSha256 !== generation.compositionChecksumSha256
  ) {
    reject("CONTROL_PLANE_REJECTED", "Current generation event does not bind the exact promoted generation.");
  }
  return event;
}

function assertPointerValidationReport(
  report: StoredGenerationValidationReport | null,
  reportId: string,
  generation: StoredCatalogGeneration,
): StoredGenerationValidationReport {
  if (
    report === null
    || report.id !== reportId
    || report.generationId !== generation.id
    || report.generationChecksumSha256 !== generation.compositionChecksumSha256
  ) {
    reject("VALIDATION_REPORT_MISMATCH", "Current pointer validation report does not bind the exact generation checksum.");
  }
  return report;
}

async function resolveGenerationFood(
  store: FoodCatalogGenerationReadStore,
  generationId: string,
  requestedFoodId: string,
): Promise<{
  food: StoredGenerationFood;
  resolvedFoodId: string;
  redirect: StoredGenerationRedirect | null;
}> {
  const direct = await store.readGenerationFood(generationId, requestedFoodId);
  if (direct !== null) {
    return { food: direct, resolvedFoodId: requestedFoodId, redirect: null };
  }

  const redirect = await store.readGenerationRedirect(generationId, requestedFoodId);
  if (redirect === null) {
    reject("GENERATION_NOT_FOUND", "Food is not present in the current generation and has no direct redirect.");
  }
  if (
    redirect.generationId !== generationId
    || redirect.sourceFoodId !== requestedFoodId
    || redirect.targetFoodId === requestedFoodId
  ) {
    reject("INVALID_REDIRECT", "Current generation redirect is malformed.");
  }

  const targetRedirect = await store.readGenerationRedirect(generationId, redirect.targetFoodId);
  if (targetRedirect !== null) {
    reject("INVALID_REDIRECT", "Current generation redirects must be direct and flattened.");
  }

  const target = await store.readGenerationFood(generationId, redirect.targetFoodId);
  if (target === null || target.foodId !== redirect.targetFoodId || target.lifecycle !== "active") {
    reject("INVALID_REDIRECT", "Current generation redirect target must be an active generation Food.");
  }

  return { food: target, resolvedFoodId: redirect.targetFoodId, redirect };
}

function buildVerificationState(
  foodId: string,
  selections: StoredGenerationSelections["verification"],
  assertions: readonly StoredFoodVerificationAssertion[],
): FoodTrustVerification {
  const result = Object.fromEntries(
    VERIFICATION_SCOPES.map((scope) => [scope, "missing"]),
  ) as FoodTrustVerification;

  const expectedIds = selections.map((selection) => {
    if (selection.foodId !== foodId) {
      reject("INVALID_VERIFICATION_SELECTION", "Generation verification selection crossed Food identity.");
    }
    return selection.assertionId;
  });
  assertExactFacts("Verification assertion", foodId, expectedIds, assertions);

  const byId = new Map(assertions.map((assertion) => [assertion.id, assertion]));
  const seenScopes = new Set<FoodVerificationScope>();
  for (const selection of selections) {
    if (seenScopes.has(selection.scope)) {
      reject("INVALID_VERIFICATION_SELECTION", "Generation verification selection contains a duplicate scope.");
    }
    const assertion = byId.get(selection.assertionId);
    if (assertion === undefined || assertion.scope !== selection.scope) {
      reject("INVALID_VERIFICATION_SELECTION", "Selected verification assertion does not match its exact scope.");
    }
    result[selection.scope] = assertion.state;
    seenScopes.add(selection.scope);
  }

  return result;
}

function activationAcceptedAtSeal(
  generation: StoredCatalogGeneration,
  food: StoredGenerationFood,
  authority: StoredActivationAuthority | null,
): boolean {
  if (food.lifecycle !== "active") return false;
  if (
    food.activationSetId === null
    || food.activationSetMemberId === null
    || food.activationGrantEventId === null
  ) {
    reject("INVALID_ACTIVATION_GRANT", "Active generation Food is missing sealed activation references.");
  }
  if (authority === null) {
    reject("INVALID_ACTIVATION_GRANT", "Selected activation authority is missing.");
  }
  if (
    authority.activationSetId !== food.activationSetId
    || authority.activationSetMemberId !== food.activationSetMemberId
    || authority.grantEventId !== food.activationGrantEventId
  ) {
    reject("INVALID_ACTIVATION_GRANT", "Selected activation authority does not match the sealed generation references.");
  }
  if (authority.foodId !== food.foodId) {
    reject("CROSS_FOOD_SELECTION", "Selected activation authority crossed Food identity.");
  }

  const sealedAt = Date.parse(generation.sealedAt);
  const grantedAt = Date.parse(authority.grantCreatedAt);
  const invalidatedAt = authority.invalidatedAt === null ? null : Date.parse(authority.invalidatedAt);
  if (!Number.isFinite(sealedAt) || !Number.isFinite(grantedAt) || (invalidatedAt !== null && !Number.isFinite(invalidatedAt))) {
    reject("CONTROL_PLANE_REJECTED", "Activation authority timestamps are invalid.");
  }

  return authority.activationPolicyVersion === generation.activationPolicyVersion
    && authority.eligibility === "eligible"
    && authority.sourceLegalAccepted
    && grantedAt <= sealedAt
    && (invalidatedAt === null || invalidatedAt > sealedAt);
}

function deriveCompleteness(
  nutritionRevision: StoredFoodNutritionRevision | null,
  servingOptions: readonly StoredFoodServingOption[],
  names: readonly StoredFoodNameFact[],
): FoodTrustProfile["completeness"] {
  const nutritionKnownFields = nutritionRevision === null
    ? 0
    : NUTRIENT_KEYS.reduce(
        (count, key) => count + (nutritionRevision[key] === null ? 0 : 1),
        0,
      );

  return {
    nutritionKnownFields,
    nutritionTotalFields: NUTRIENT_KEYS.length,
    hasHouseholdServing: servingOptions.some((serving) => serving.unitCode !== "g" && serving.unitCode !== "ml"),
    hasPreferredDisplayName: names.some((name) => name.role === "preferred_display"),
  };
}

export async function getCurrentGenerationFood(
  store: FoodCatalogGenerationReadStore,
  requestedFoodId: string,
): Promise<CurrentGenerationFoodView> {
  const pointer = await store.readCurrentPointer();
  assertCurrentPointer(pointer);

  const generation = await store.readGeneration(pointer.currentGenerationId);
  if (generation === null) {
    reject("GENERATION_NOT_FOUND", "Current pointer generation does not exist.");
  }
  if (generation.id !== pointer.currentGenerationId || !generation.sealedAt.trim()) {
    reject("GENERATION_NOT_SEALED", "Current generation authority is missing an exact sealed generation.");
  }

  const [rawEvent, rawReport] = await Promise.all([
    store.readGenerationEvent(pointer.currentEventId),
    store.readValidationReport(pointer.currentValidationReportId),
  ]);
  const currentEvent = assertGenerationCurrentEvent(rawEvent, pointer.currentEventId, generation);
  const validationReport = assertPointerValidationReport(
    rawReport,
    pointer.currentValidationReportId,
    generation,
  );

  const { food, resolvedFoodId, redirect } = await resolveGenerationFood(
    store,
    generation.id,
    requestedFoodId,
  );
  if (food.generationId !== generation.id || food.foodId !== resolvedFoodId) {
    reject("CROSS_FOOD_SELECTION", "Generation Food does not bind the requested generation/Food identity.");
  }

  const selections = await store.readGenerationSelections(generation.id, resolvedFoodId);
  const [
    nutritionRevision,
    servingOptions,
    names,
    taxonomyAssignments,
    marketAssignments,
    verificationAssertions,
    validationFindings,
  ] = await Promise.all([
    food.nutritionRevisionId === null
      ? Promise.resolve(null)
      : store.readNutritionRevision(resolvedFoodId, food.nutritionRevisionId),
    store.readServingOptions(resolvedFoodId, selections.servingOptionIds),
    store.readNames(resolvedFoodId, selections.nameFactIds),
    store.readTaxonomyAssignments(resolvedFoodId, selections.taxonomyAssignmentIds),
    store.readMarketAssignments(resolvedFoodId, selections.marketAssignmentIds),
    store.readVerificationAssertions(resolvedFoodId, selections.verification),
    store.readValidationFindings(validationReport.id),
  ]);

  if (food.nutritionRevisionId !== null) {
    if (nutritionRevision === null || nutritionRevision.id !== food.nutritionRevisionId) {
      reject("CONTROL_PLANE_REJECTED", "Selected nutrition revision did not resolve exactly.");
    }
    if (nutritionRevision.foodId !== resolvedFoodId) {
      reject("CROSS_FOOD_SELECTION", "Selected nutrition revision crossed Food identity.");
    }
  }
  assertExactFacts("Serving option", resolvedFoodId, selections.servingOptionIds, servingOptions);
  assertExactFacts("Name fact", resolvedFoodId, selections.nameFactIds, names);
  assertExactFacts("Taxonomy assignment", resolvedFoodId, selections.taxonomyAssignmentIds, taxonomyAssignments);
  assertExactFacts("Market assignment", resolvedFoodId, selections.marketAssignmentIds, marketAssignments);

  const verification = buildVerificationState(
    resolvedFoodId,
    selections.verification,
    verificationAssertions,
  );

  let activationAuthority: StoredActivationAuthority | null = null;
  if (food.lifecycle === "active") {
    if (food.activationSetMemberId === null || food.activationGrantEventId === null) {
      reject("INVALID_ACTIVATION_GRANT", "Active generation Food is missing activation authority references.");
    }
    activationAuthority = await store.readActivationAuthority(
      food.activationSetMemberId,
      food.activationGrantEventId,
    );
  }
  const activationAccepted = activationAcceptedAtSeal(generation, food, activationAuthority);

  const trust = deriveFoodTrustProfile({
    generationId: generation.id,
    foodId: resolvedFoodId,
    lifecycle: food.lifecycle,
    verification,
    activationAccepted,
    blockingConditionCount: validationReport.blockerCount,
    completeness: deriveCompleteness(nutritionRevision, servingOptions, names),
    trustPolicyVersion: generation.trustPolicyVersion,
  });

  return {
    pointer,
    generation,
    currentEvent,
    validationReport,
    validationFindings,
    requestedFoodId,
    resolvedFoodId,
    food,
    redirect,
    selections,
    nutritionRevision,
    servingOptions,
    names,
    taxonomyAssignments,
    marketAssignments,
    verificationAssertions,
    activationAuthority,
    trust,
  };
}

export async function resolveCurrentGenerationFoodForNewUse(
  store: FoodCatalogGenerationReadStore,
  requestedFoodId: string,
): Promise<CurrentGenerationFoodView> {
  const view = await getCurrentGenerationFood(store, requestedFoodId);
  if (view.food.lifecycle !== "active") {
    reject("CONTROL_PLANE_REJECTED", "Only active current-generation Foods may be selected for new use.");
  }
  return view;
}

export function projectCurrentGenerationCompatibility(
  view: CurrentGenerationFoodView,
  selection: CurrentGenerationCompatibilitySelection,
): ResolvedCatalogFood {
  if (!view.selections.nameFactIds.includes(selection.nameFactId)) {
    reject("CONTROL_PLANE_REJECTED", "Compatibility projection name must be an exact generation-selected fact.");
  }
  const selectedName = view.names.find((name) => name.id === selection.nameFactId);
  if (selectedName === undefined) {
    reject("CONTROL_PLANE_REJECTED", "Compatibility projection selected name is unavailable.");
  }
  if (view.nutritionRevision === null) {
    reject("CONTROL_PLANE_REJECTED", "Compatibility projection requires the generation-selected nutrition revision.");
  }

  let selectedServing: StoredFoodServingOption | null = null;
  if (selection.servingOptionId !== null) {
    if (!view.selections.servingOptionIds.includes(selection.servingOptionId)) {
      reject("CONTROL_PLANE_REJECTED", "Compatibility projection serving must be an exact generation-selected fact.");
    }
    selectedServing = view.servingOptions.find((serving) => serving.id === selection.servingOptionId) ?? null;
    if (selectedServing === null) {
      reject("CONTROL_PLANE_REJECTED", "Compatibility projection selected serving is unavailable.");
    }
  }

  const compatibilitySelection: FoodCatalogCompatibilitySelection = {
    root: {
      id: view.resolvedFoodId,
      lifecycleStatus: view.food.lifecycle,
      mergedIntoFoodId: null,
    },
    selectedName,
    selectedNutrition: view.nutritionRevision,
    selectedServing,
    trust: { verified: view.trust.verified },
  };
  return projectFoodCatalogCompatibility(compatibilitySelection);
}
