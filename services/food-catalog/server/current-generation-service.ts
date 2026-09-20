import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
import type {
  FoodCatalogGenerationReadStore,
  FoodCatalogGenerationTrustBatchReadStore,
  StoredGenerationTrustHydration,
} from "./generation-store";
import { createSupabaseFoodCatalogGenerationReadStore } from "./supabase-generation-read-store";

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

type CurrentGenerationSharedAuthority = {
  pointer: StoredCurrentGenerationPointer & {
    currentGenerationId: string;
    currentEventId: string;
    currentValidationReportId: string;
  };
  generation: StoredCatalogGeneration;
  currentEvent: StoredGenerationEvent;
  validationReport: StoredGenerationValidationReport;
};

async function readCurrentGenerationSharedAuthority(
  store: Pick<FoodCatalogGenerationReadStore, "readCurrentPointer" | "readGeneration" | "readGenerationEvent" | "readValidationReport">,
): Promise<CurrentGenerationSharedAuthority> {
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
  return {
    pointer,
    generation,
    currentEvent: assertGenerationCurrentEvent(rawEvent, pointer.currentEventId, generation),
    validationReport: assertPointerValidationReport(
      rawReport,
      pointer.currentValidationReportId,
      generation,
    ),
  };
}

function deriveCurrentGenerationTrust({
  generation,
  validationReport,
  food,
  resolvedFoodId,
  selections,
  nutritionRevision,
  servingOptions,
  names,
  taxonomyAssignments,
  marketAssignments,
  verificationAssertions,
  activationAuthority,
}: {
  generation: StoredCatalogGeneration;
  validationReport: StoredGenerationValidationReport;
  food: StoredGenerationFood;
  resolvedFoodId: string;
  selections: StoredGenerationSelections;
  nutritionRevision: StoredFoodNutritionRevision | null;
  servingOptions: readonly StoredFoodServingOption[];
  names: readonly StoredFoodNameFact[];
  taxonomyAssignments: readonly StoredFoodTaxonomyAssignment[];
  marketAssignments: readonly StoredFoodMarketAssignment[];
  verificationAssertions: readonly StoredFoodVerificationAssertion[];
  activationAuthority: StoredActivationAuthority | null;
}): FoodTrustProfile {
  if (food.generationId !== generation.id || food.foodId !== resolvedFoodId) {
    reject("CROSS_FOOD_SELECTION", "Generation Food does not bind the requested generation/Food identity.");
  }

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
  const activationAccepted = activationAcceptedAtSeal(generation, food, activationAuthority);

  return deriveFoodTrustProfile({
    generationId: generation.id,
    foodId: resolvedFoodId,
    lifecycle: food.lifecycle,
    verification,
    activationAccepted,
    blockingConditionCount: validationReport.blockerCount,
    completeness: deriveCompleteness(nutritionRevision, servingOptions, names),
    trustPolicyVersion: generation.trustPolicyVersion,
  });
}

export async function getCurrentGenerationFood(
  store: FoodCatalogGenerationReadStore,
  requestedFoodId: string,
): Promise<CurrentGenerationFoodView> {
  const { pointer, generation, currentEvent, validationReport } = await readCurrentGenerationSharedAuthority(store);

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

  const trust = deriveCurrentGenerationTrust({
    generation,
    validationReport,
    food,
    resolvedFoodId,
    selections,
    nutritionRevision,
    servingOptions,
    names,
    taxonomyAssignments,
    marketAssignments,
    verificationAssertions,
    activationAuthority,
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

export type CurrentGenerationTrustForNewUseResult = {
  requestedFoodId: string;
  resolvedFoodId: string | null;
  trust: FoodTrustProfile | null;
};

function emptyTrustResults(
  requestedFoodIds: readonly string[],
): Map<string, CurrentGenerationTrustForNewUseResult> {
  return new Map<string, CurrentGenerationTrustForNewUseResult>(
    requestedFoodIds.map((requestedFoodId) => [requestedFoodId, {
      requestedFoodId,
      resolvedFoodId: null,
      trust: null,
    }]),
  );
}

function uniqueFoodIds(foodIds: readonly string[]) {
  return Array.from(new Set(
    foodIds
      .filter((foodId) => typeof foodId === "string" && foodId.trim())
      .map((foodId) => foodId.trim()),
  ));
}

function factsSelectedByIds<T extends StoredFoodFact>(facts: readonly T[], ids: readonly string[]) {
  if (!ids.length) return [] as T[];
  const selected = new Set(ids);
  return facts.filter((fact) => selected.has(fact.id));
}

function groupedBy<T>(values: readonly T[], key: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const id = key(value);
    const bucket = groups.get(id);
    if (bucket) bucket.push(value);
    else groups.set(id, [value]);
  }
  return groups;
}

const EMPTY_SELECTIONS: StoredGenerationSelections = {
  servingOptionIds: [],
  nameFactIds: [],
  taxonomyAssignmentIds: [],
  marketAssignmentIds: [],
  verification: [],
};

export async function resolveCurrentGenerationTrustForNewUseBatch(
  store: FoodCatalogGenerationTrustBatchReadStore,
  requestedFoodIds: readonly string[],
): Promise<Map<string, CurrentGenerationTrustForNewUseResult>> {
  const requested = uniqueFoodIds(requestedFoodIds);
  const results = emptyTrustResults(requested);
  if (!requested.length) return results;

  let shared: CurrentGenerationSharedAuthority;
  try {
    shared = await readCurrentGenerationSharedAuthority(store);
  } catch {
    return results;
  }

  const { generation, validationReport } = shared;
  let directFoods: StoredGenerationFood[];
  try {
    directFoods = await store.readGenerationFoodsByIds(generation.id, requested);
  } catch {
    return results;
  }

  const directById = groupedBy(directFoods, (food) => food.foodId);
  const resolvedByRequested = new Map<string, {
    food: StoredGenerationFood;
    resolvedFoodId: string;
    redirect: StoredGenerationRedirect | null;
  }>();
  const missingRequested: string[] = [];

  for (const requestedFoodId of requested) {
    const matches = directById.get(requestedFoodId) ?? [];
    if (matches.length === 0) {
      missingRequested.push(requestedFoodId);
      continue;
    }
    if (matches.length !== 1) continue;
    const food = matches[0]!;
    if (
      food.generationId !== generation.id
      || food.foodId !== requestedFoodId
      || food.lifecycle !== "active"
    ) {
      results.set(requestedFoodId, {
        requestedFoodId,
        resolvedFoodId: food.foodId === requestedFoodId ? requestedFoodId : null,
        trust: null,
      });
      continue;
    }
    resolvedByRequested.set(requestedFoodId, {
      food,
      resolvedFoodId: requestedFoodId,
      redirect: null,
    });
  }

  if (missingRequested.length) {
    let redirects: StoredGenerationRedirect[] = [];
    try {
      redirects = await store.readGenerationRedirectsBySourceIds(generation.id, missingRequested);
    } catch {
      redirects = [];
    }
    const redirectBySource = groupedBy(redirects, (redirect) => redirect.sourceFoodId);
    const validRedirects = new Map<string, StoredGenerationRedirect>();
    for (const requestedFoodId of missingRequested) {
      const matches = redirectBySource.get(requestedFoodId) ?? [];
      if (matches.length !== 1) continue;
      const redirect = matches[0]!;
      if (
        redirect.generationId !== generation.id
        || redirect.sourceFoodId !== requestedFoodId
        || redirect.targetFoodId === requestedFoodId
      ) {
        continue;
      }
      validRedirects.set(requestedFoodId, redirect);
    }

    const targetIds = Array.from(new Set(Array.from(validRedirects.values()).map((redirect) => redirect.targetFoodId)));
    if (targetIds.length) {
      let targetRedirects: StoredGenerationRedirect[] = [];
      let targetFoods: StoredGenerationFood[] = [];
      try {
        [targetRedirects, targetFoods] = await Promise.all([
          store.readGenerationRedirectsBySourceIds(generation.id, targetIds),
          store.readGenerationFoodsByIds(generation.id, targetIds),
        ]);
      } catch {
        targetRedirects = targetIds.map((sourceFoodId) => ({
          generationId: generation.id,
          sourceFoodId,
          targetFoodId: sourceFoodId,
        }));
        targetFoods = [];
      }

      const targetRedirectBySource = groupedBy(targetRedirects, (redirect) => redirect.sourceFoodId);
      const targetFoodById = groupedBy(targetFoods, (food) => food.foodId);
      for (const [requestedFoodId, redirect] of validRedirects) {
        if ((targetRedirectBySource.get(redirect.targetFoodId) ?? []).length !== 0) continue;
        const targets = targetFoodById.get(redirect.targetFoodId) ?? [];
        if (targets.length !== 1) continue;
        const target = targets[0]!;
        if (
          target.generationId !== generation.id
          || target.foodId !== redirect.targetFoodId
          || target.lifecycle !== "active"
        ) {
          continue;
        }
        resolvedByRequested.set(requestedFoodId, {
          food: target,
          resolvedFoodId: redirect.targetFoodId,
          redirect,
        });
      }
    }
  }

  const survivors = Array.from(new Map(
    Array.from(resolvedByRequested.values()).map((entry) => [entry.resolvedFoodId, entry.food]),
  ).values());
  if (!survivors.length) return results;

  let hydration: StoredGenerationTrustHydration;
  try {
    hydration = await store.readGenerationTrustHydration(generation.id, survivors);
  } catch {
    for (const [requestedFoodId, resolved] of resolvedByRequested) {
      results.set(requestedFoodId, {
        requestedFoodId,
        resolvedFoodId: resolved.resolvedFoodId,
        trust: null,
      });
    }
    return results;
  }

  const trustByResolvedFoodId = new Map<string, FoodTrustProfile | null>();
  for (const food of survivors) {
    const resolvedFoodId = food.foodId;
    try {
      const selections = hydration.selectionsByFoodId[resolvedFoodId] ?? EMPTY_SELECTIONS;
      const nutritionRevision = food.nutritionRevisionId === null
        ? null
        : (hydration.nutritionRevisions.filter((revision) => revision.id === food.nutritionRevisionId)[0] ?? null);
      const servingOptions = factsSelectedByIds(hydration.servingOptions, selections.servingOptionIds);
      const names = factsSelectedByIds(hydration.names, selections.nameFactIds);
      const taxonomyAssignments = factsSelectedByIds(hydration.taxonomyAssignments, selections.taxonomyAssignmentIds);
      const marketAssignments = factsSelectedByIds(hydration.marketAssignments, selections.marketAssignmentIds);
      const verificationAssertions = factsSelectedByIds(
        hydration.verificationAssertions,
        selections.verification.map((selection) => selection.assertionId),
      );

      let activationAuthority: StoredActivationAuthority | null = null;
      if (food.activationSetMemberId !== null && food.activationGrantEventId !== null) {
        const matches = hydration.activationAuthorities.filter((authority) => (
          authority.activationSetMemberId === food.activationSetMemberId
          && authority.grantEventId === food.activationGrantEventId
        ));
        if (matches.length === 1) activationAuthority = matches[0]!;
      }

      trustByResolvedFoodId.set(resolvedFoodId, deriveCurrentGenerationTrust({
        generation,
        validationReport,
        food,
        resolvedFoodId,
        selections,
        nutritionRevision,
        servingOptions,
        names,
        taxonomyAssignments,
        marketAssignments,
        verificationAssertions,
        activationAuthority,
      }));
    } catch {
      trustByResolvedFoodId.set(resolvedFoodId, null);
    }
  }

  for (const [requestedFoodId, resolved] of resolvedByRequested) {
    results.set(requestedFoodId, {
      requestedFoodId,
      resolvedFoodId: resolved.resolvedFoodId,
      trust: trustByResolvedFoodId.get(resolved.resolvedFoodId) ?? null,
    });
  }
  return results;
}

export function resolveCurrentGenerationTrustForNewUseBatchFromSupabase(
  supabase: SupabaseClient,
  requestedFoodIds: readonly string[],
): Promise<Map<string, CurrentGenerationTrustForNewUseResult>> {
  return resolveCurrentGenerationTrustForNewUseBatch(
    createSupabaseFoodCatalogGenerationReadStore(supabase),
    requestedFoodIds,
  );
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

export function resolveCurrentGenerationFoodForNewUseFromSupabase(
  supabase: SupabaseClient,
  requestedFoodId: string,
): Promise<CurrentGenerationFoodView> {
  return resolveCurrentGenerationFoodForNewUse(
    createSupabaseFoodCatalogGenerationReadStore(supabase),
    requestedFoodId,
  );
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
