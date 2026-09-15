import type {
  GenerationFoodSelection,
  GenerationRedirectSelection,
  GenerationValidationFinding,
  GenerationFindingSeverity,
  GenerationVerificationSelection,
} from "./domain/generations.ts";
import type { FoodVerificationScope, FoodVerificationState } from "./domain/verification.ts";
import {
  computeGenerationCompositionChecksum,
  type GenerationAssignmentSelection,
  type GenerationNameSelection,
  type GenerationServingSelection,
} from "./generation-composition.ts";

export const GENERATION_BLOCKING_REASONS = [
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
] as const;

export type GenerationBlockingReason = (typeof GENERATION_BLOCKING_REASONS)[number];
export const GENERATION_VALIDATOR_SET_VERSION = "food-catalog-generation-validator-set-v1";

export type GenerationValidationGeneration = Readonly<{
  id: string;
  compositionSchemaVersion: string;
  generationPolicyVersion: string;
  activationPolicyVersion: string;
  trustPolicyVersion: string;
  projectionVersion: string;
  compositionChecksumSha256: string;
  sealedAt: string;
}>;

export type GenerationValidationFood = GenerationFoodSelection & Readonly<{ generationId: string }>;
export type GenerationValidationRedirect = GenerationRedirectSelection & Readonly<{ generationId: string }>;

export type GenerationValidationSelections = Readonly<{
  servingOptionIds: readonly string[];
  nameFactIds: readonly string[];
  taxonomyAssignmentIds: readonly string[];
  marketAssignmentIds: readonly string[];
  verification: readonly GenerationVerificationSelection[];
}>;

export type GenerationValidationActivationAuthority = Readonly<{
  activationSetId: string;
  activationSetMemberId: string;
  foodId: string;
  activationPolicyVersion: string;
  eligibility: "eligible" | "rejected";
  sourceLegalAccepted: boolean;
  grantEventId: string;
  grantCreatedAt: string;
  invalidatedAt: string | null;
}>;

export type GenerationValidationSnapshot = Readonly<{
  generation: GenerationValidationGeneration;
  foods: readonly GenerationValidationFood[];
  redirects: readonly GenerationValidationRedirect[];
  selectionsByFoodId: Readonly<Record<string, GenerationValidationSelections>>;
  nutritionRevisions: readonly Readonly<{ id: string; foodId: string }>[];
  servingOptions: readonly Readonly<{ id: string; foodId: string }>[];
  names: readonly Readonly<{ id: string; foodId: string; role: string }>[];
  taxonomyAssignments: readonly Readonly<{ id: string; foodId: string; action: string }>[];
  marketAssignments: readonly Readonly<{ id: string; foodId: string; action: string }>[];
  verificationAssertions: readonly Readonly<{
    id: string;
    foodId: string;
    scope: FoodVerificationScope;
    state: FoodVerificationState;
  }>[];
  activationAuthorities: readonly GenerationValidationActivationAuthority[];
  verificationReadErrorsByFoodId?: Readonly<Record<string, string>>;
}>;

export type GenerationVerificationStateRecord = Readonly<{
  foodId: string;
  scope: FoodVerificationScope;
  assertionId: string;
  state: FoodVerificationState;
}>;

export type GenerationSemanticValidationResult = Readonly<{
  findings: readonly GenerationValidationFinding[];
  verificationStates: readonly GenerationVerificationStateRecord[];
  recomputedChecksum: string;
  blockerCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}>;

type StoredFact = Readonly<{ id: string; foodId: string }>;

function finding(
  reasonCode: GenerationBlockingReason,
  foodId: string | null,
  evidenceReference: string | null,
  details: unknown,
): GenerationValidationFinding {
  return {
    reasonCode,
    foodId,
    severity: "error",
    blocking: true,
    evidenceReference,
    validatorPolicyVersion: GENERATION_VALIDATOR_SET_VERSION,
    details,
  };
}

function sortFindings(values: readonly GenerationValidationFinding[]): GenerationValidationFinding[] {
  return [...values].sort((left, right) => {
    if (left.blocking !== right.blocking) return left.blocking ? -1 : 1;
    return left.severity.localeCompare(right.severity)
      || (left.foodId ?? "").localeCompare(right.foodId ?? "")
      || left.reasonCode.localeCompare(right.reasonCode)
      || (left.evidenceReference ?? "").localeCompare(right.evidenceReference ?? "");
  });
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} is not a valid timestamp.`);
  return timestamp;
}

function selectedFactsFromMap<T extends StoredFact>(
  selectedIds: readonly string[],
  byId: ReadonlyMap<string, T>,
  foodId: string,
  kind: string,
  findings: GenerationValidationFinding[],
): T[] {
  const hydrated: T[] = [];
  for (const id of selectedIds) {
    const row = byId.get(id);
    if (!row) {
      findings.push(finding("SELECTED_FACT_MISSING", foodId, id, { kind, selectedId: id }));
      continue;
    }
    if (row.foodId !== foodId) {
      findings.push(finding("SELECTED_FACT_CROSS_FOOD", foodId, id, { kind, selectedId: id, actualFoodId: row.foodId }));
      continue;
    }
    hydrated.push(row);
  }
  return hydrated;
}

export function validateGenerationSemanticSnapshot(
  snapshot: GenerationValidationSnapshot,
  expectedChecksum: string,
): GenerationSemanticValidationResult {
  const { generation, foods, redirects } = snapshot;
  const nutritionById = new Map(snapshot.nutritionRevisions.map((row) => [row.id, row]));
  const servingById = new Map(snapshot.servingOptions.map((row) => [row.id, row]));
  const nameById = new Map(snapshot.names.map((row) => [row.id, row]));
  const taxonomyById = new Map(snapshot.taxonomyAssignments.map((row) => [row.id, row]));
  const marketById = new Map(snapshot.marketAssignments.map((row) => [row.id, row]));
  const verificationById = new Map(snapshot.verificationAssertions.map((row) => [row.id, row]));
  const activationByKey = new Map(snapshot.activationAuthorities.map((row) => [
    `${row.activationSetMemberId}:${row.grantEventId}`,
    row,
  ]));

  const findings: GenerationValidationFinding[] = [];
  const verificationStates: GenerationVerificationStateRecord[] = [];
  const servingSelections: GenerationServingSelection[] = [];
  const nameSelections: GenerationNameSelection[] = [];
  const taxonomySelections: GenerationAssignmentSelection[] = [];
  const marketSelections: GenerationAssignmentSelection[] = [];
  const verificationSelections: GenerationVerificationSelection[] = [];
  const sealedAt = parseTimestamp(generation.sealedAt, "Generation sealedAt");

  for (const food of foods) {
    if (food.generationId !== generation.id) throw new Error("Generation Food escaped exact generation scope.");
    const selections = snapshot.selectionsByFoodId[food.foodId];
    if (!selections) throw new Error(`Validation hydration omitted generation Food ${food.foodId}.`);

    servingSelections.push(...selections.servingOptionIds.map((servingOptionId) => ({ foodId: food.foodId, servingOptionId })));
    nameSelections.push(...selections.nameFactIds.map((nameFactId) => ({ foodId: food.foodId, nameFactId })));
    taxonomySelections.push(...selections.taxonomyAssignmentIds.map((assignmentId) => ({ foodId: food.foodId, assignmentId })));
    marketSelections.push(...selections.marketAssignmentIds.map((assignmentId) => ({ foodId: food.foodId, assignmentId })));
    verificationSelections.push(...selections.verification);

    if (food.nutritionRevisionId !== null) {
      const nutrition = nutritionById.get(food.nutritionRevisionId);
      if (!nutrition) {
        findings.push(finding("SELECTED_FACT_MISSING", food.foodId, food.nutritionRevisionId, { kind: "nutrition", selectedId: food.nutritionRevisionId }));
      } else if (nutrition.foodId !== food.foodId) {
        findings.push(finding("SELECTED_FACT_CROSS_FOOD", food.foodId, food.nutritionRevisionId, {
          kind: "nutrition",
          selectedId: food.nutritionRevisionId,
          actualFoodId: nutrition.foodId,
        }));
      }
    }

    selectedFactsFromMap(selections.servingOptionIds, servingById, food.foodId, "serving", findings);
    const selectedNames = selectedFactsFromMap(selections.nameFactIds, nameById, food.foodId, "name", findings);
    const selectedTaxonomy = selectedFactsFromMap(selections.taxonomyAssignmentIds, taxonomyById, food.foodId, "taxonomy", findings);
    const selectedMarkets = selectedFactsFromMap(selections.marketAssignmentIds, marketById, food.foodId, "market", findings);

    for (const assignment of selectedTaxonomy) {
      if (assignment.action === "remove") findings.push(finding("SELECTED_TAXONOMY_REMOVAL", food.foodId, assignment.id, { assignmentId: assignment.id, action: assignment.action }));
    }
    for (const assignment of selectedMarkets) {
      if (assignment.action === "remove") findings.push(finding("SELECTED_MARKET_REMOVAL", food.foodId, assignment.id, { assignmentId: assignment.id, action: assignment.action }));
    }

    const verificationReadError = snapshot.verificationReadErrorsByFoodId?.[food.foodId];
    if (verificationReadError) {
      findings.push(finding("INVALID_VERIFICATION_SELECTION", food.foodId, null, { message: verificationReadError }));
    } else {
      for (const selection of selections.verification) {
        const assertion = verificationById.get(selection.assertionId);
        if (!assertion || assertion.foodId !== food.foodId || assertion.scope !== selection.scope) {
          findings.push(finding("INVALID_VERIFICATION_SELECTION", food.foodId, selection.assertionId, {
            scope: selection.scope,
            assertionId: selection.assertionId,
            actualFoodId: assertion?.foodId ?? null,
            actualScope: assertion?.scope ?? null,
          }));
          continue;
        }
        verificationStates.push({
          foodId: food.foodId,
          scope: selection.scope,
          assertionId: selection.assertionId,
          state: assertion.state,
        });
      }
    }

    if (food.lifecycle === "active") {
      if (!selectedNames.some((name) => name.role === "preferred_display")) {
        findings.push(finding("ACTIVE_FOOD_MISSING_DISPLAY_NAME", food.foodId, null, { selectedNameFactIds: selections.nameFactIds }));
      }
      const authority = activationByKey.get(`${food.activationSetMemberId}:${food.activationGrantEventId}`) ?? null;
      let validActivation = authority !== null;
      if (authority) {
        validActivation = authority.foodId === food.foodId
          && authority.activationSetId === food.activationSetId
          && authority.activationSetMemberId === food.activationSetMemberId
          && authority.grantEventId === food.activationGrantEventId
          && authority.activationPolicyVersion === generation.activationPolicyVersion
          && authority.eligibility === "eligible"
          && authority.sourceLegalAccepted
          && parseTimestamp(authority.grantCreatedAt, "Activation grant createdAt") <= sealedAt
          && (authority.invalidatedAt === null || parseTimestamp(authority.invalidatedAt, "Activation invalidatedAt") > sealedAt);
      }
      if (!validActivation) {
        findings.push(finding("ACTIVE_FOOD_MISSING_ACTIVATION_GRANT", food.foodId, food.activationGrantEventId, {
          activationSetId: food.activationSetId,
          activationSetMemberId: food.activationSetMemberId,
          activationGrantEventId: food.activationGrantEventId,
        }));
      }
    }
  }

  const foodById = new Map(foods.map((food) => [food.foodId, food]));
  const redirectSources = new Set(redirects.map((redirect) => redirect.sourceFoodId));
  for (const redirect of redirects) {
    if (redirect.generationId !== generation.id) throw new Error("Generation redirect escaped exact generation scope.");
    const target = foodById.get(redirect.targetFoodId);
    if (!target || target.lifecycle !== "active") {
      findings.push(finding("REDIRECT_TARGET_NOT_ACTIVE", redirect.sourceFoodId, redirect.targetFoodId, {
        sourceFoodId: redirect.sourceFoodId,
        targetFoodId: redirect.targetFoodId,
        targetLifecycle: target?.lifecycle ?? null,
      }));
    }
    if (redirectSources.has(redirect.targetFoodId)) {
      findings.push(finding("REDIRECT_CHAIN", redirect.sourceFoodId, redirect.targetFoodId, {
        sourceFoodId: redirect.sourceFoodId,
        targetFoodId: redirect.targetFoodId,
      }));
    }
  }

  const recomputedChecksum = computeGenerationCompositionChecksum({
    compositionSchemaVersion: generation.compositionSchemaVersion,
    generationPolicyVersion: generation.generationPolicyVersion,
    activationPolicyVersion: generation.activationPolicyVersion,
    trustPolicyVersion: generation.trustPolicyVersion,
    projectionVersion: generation.projectionVersion,
    foods: foods.map(({ generationId: _generationId, ...food }) => food),
    servings: servingSelections,
    names: nameSelections,
    taxonomy: taxonomySelections,
    markets: marketSelections,
    verification: verificationSelections,
    redirects: redirects.map(({ generationId: _generationId, ...redirect }) => redirect),
  });

  if (expectedChecksum !== generation.compositionChecksumSha256 || recomputedChecksum !== generation.compositionChecksumSha256) {
    findings.push(finding("GENERATION_CHECKSUM_MISMATCH", null, generation.id, {
      expectedChecksum,
      storedChecksum: generation.compositionChecksumSha256,
      recomputedChecksum,
    }));
  }

  const sortedFindings = sortFindings(findings);
  verificationStates.sort((left, right) => left.foodId.localeCompare(right.foodId)
    || left.scope.localeCompare(right.scope)
    || left.assertionId.localeCompare(right.assertionId));
  const countSeverity = (severity: GenerationFindingSeverity) => sortedFindings.filter((entry) => entry.severity === severity).length;

  return Object.freeze({
    findings: Object.freeze(sortedFindings),
    verificationStates: Object.freeze(verificationStates),
    recomputedChecksum,
    blockerCount: sortedFindings.filter((entry) => entry.blocking).length,
    errorCount: countSeverity("error"),
    warningCount: countSeverity("warning"),
    infoCount: countSeverity("info"),
  });
}
