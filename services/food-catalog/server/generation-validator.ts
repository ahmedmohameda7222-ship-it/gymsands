import "server-only";

import { randomUUID } from "node:crypto";

import {
  validateControlPlaneActorContext,
  type ControlPlaneActorContext,
  type GenerationFindingSeverity,
  type GenerationValidationFinding,
} from "@/lib/food-catalog/domain/generations";
import type { FoodVerificationScope, FoodVerificationState } from "@/lib/food-catalog/domain/verification";
import { sha256Canonical } from "./canonical-hash";
import type {
  StoredFoodMarketAssignment,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";
import { FoodCatalogGenerationError } from "./generation-errors";
import {
  computeGenerationCompositionChecksum,
  type GenerationAssignmentSelection,
  type GenerationNameSelection,
  type GenerationServingSelection,
} from "./generation-builder";
import type { GenerationCommandResult } from "./generation-contracts";
import type {
  FoodCatalogGenerationCommandStore,
  FoodCatalogGenerationReadStore,
} from "./generation-store";

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

export type GenerationValidationFindingRecord = GenerationValidationFinding & {
  id: string;
  findingOrdinal: number;
};

export type GenerationVerificationStateRecord = {
  foodId: string;
  scope: FoodVerificationScope;
  assertionId: string;
  state: FoodVerificationState;
};

export type GenerationValidationReport = {
  id: string;
  generationId: string;
  generationChecksumSha256: string;
  validatorSetVersion: string;
  policyVersion: string;
  reportChecksumSha256: string;
  blockerCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  findings: GenerationValidationFindingRecord[];
  verificationStates: GenerationVerificationStateRecord[];
};

type FindingDraft = GenerationValidationFinding;

type StoredFact = { id: string; foodId: string };

function finding(
  reasonCode: GenerationBlockingReason,
  foodId: string | null,
  evidenceReference: string | null,
  details: unknown,
): FindingDraft {
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

function sortFindings(values: FindingDraft[]): FindingDraft[] {
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
  if (!Number.isFinite(timestamp)) {
    throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", `${label} is not a valid timestamp.`);
  }
  return timestamp;
}

function selectedFacts<T extends StoredFact>(
  selectedIds: readonly string[],
  rows: readonly T[],
  foodId: string,
  kind: string,
  findings: FindingDraft[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const hydrated: T[] = [];
  for (const id of selectedIds) {
    const row = byId.get(id);
    if (!row) {
      findings.push(finding(
        "SELECTED_FACT_MISSING",
        foodId,
        id,
        { kind, selectedId: id },
      ));
      continue;
    }
    if (row.foodId !== foodId) {
      findings.push(finding(
        "SELECTED_FACT_CROSS_FOOD",
        foodId,
        id,
        { kind, selectedId: id, actualFoodId: row.foodId },
      ));
      continue;
    }
    hydrated.push(row);
  }
  return hydrated;
}

function reportSemanticPayload(report: Omit<GenerationValidationReport, "id" | "reportChecksumSha256">) {
  return {
    generationId: report.generationId,
    generationChecksumSha256: report.generationChecksumSha256,
    validatorSetVersion: report.validatorSetVersion,
    policyVersion: report.policyVersion,
    blockerCount: report.blockerCount,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    infoCount: report.infoCount,
    findings: report.findings.map(({ id: _id, ...entry }) => entry),
    verificationStates: report.verificationStates,
  };
}

export async function validateStoredGeneration(
  readStore: FoodCatalogGenerationReadStore,
  generationId: string,
  expectedChecksum: string,
): Promise<GenerationValidationReport> {
  const generation = await readStore.readGeneration(generationId);
  if (!generation) {
    throw new FoodCatalogGenerationError("GENERATION_NOT_FOUND", `Catalog Generation ${generationId} does not exist.`);
  }

  const foods = await readStore.readGenerationFoods(generationId);
  const redirects = await readStore.readGenerationRedirects(generationId);
  const findings: FindingDraft[] = [];
  const verificationStates: GenerationVerificationStateRecord[] = [];
  const servingSelections: GenerationServingSelection[] = [];
  const nameSelections: GenerationNameSelection[] = [];
  const taxonomySelections: GenerationAssignmentSelection[] = [];
  const marketSelections: GenerationAssignmentSelection[] = [];
  const verificationSelections: Array<{ foodId: string; scope: FoodVerificationScope; assertionId: string }> = [];

  const sealedAt = parseTimestamp(generation.sealedAt, "Generation sealedAt");

  for (const food of foods) {
    if (food.generationId !== generationId) {
      throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", "Generation Food escaped exact generation scope.");
    }
    const selections = await readStore.readGenerationSelections(generationId, food.foodId);
    servingSelections.push(...selections.servingOptionIds.map((servingOptionId) => ({ foodId: food.foodId, servingOptionId })));
    nameSelections.push(...selections.nameFactIds.map((nameFactId) => ({ foodId: food.foodId, nameFactId })));
    taxonomySelections.push(...selections.taxonomyAssignmentIds.map((assignmentId) => ({ foodId: food.foodId, assignmentId })));
    marketSelections.push(...selections.marketAssignmentIds.map((assignmentId) => ({ foodId: food.foodId, assignmentId })));
    verificationSelections.push(...selections.verification);

    if (food.nutritionRevisionId !== null) {
      const nutrition = await readStore.readNutritionRevision(food.foodId, food.nutritionRevisionId);
      if (!nutrition) {
        findings.push(finding("SELECTED_FACT_MISSING", food.foodId, food.nutritionRevisionId, {
          kind: "nutrition",
          selectedId: food.nutritionRevisionId,
        }));
      } else if (nutrition.foodId !== food.foodId) {
        findings.push(finding("SELECTED_FACT_CROSS_FOOD", food.foodId, food.nutritionRevisionId, {
          kind: "nutrition",
          selectedId: food.nutritionRevisionId,
          actualFoodId: nutrition.foodId,
        }));
      }
    }

    const [servings, names, taxonomy, markets] = await Promise.all([
      readStore.readServingOptions(food.foodId, selections.servingOptionIds),
      readStore.readNames(food.foodId, selections.nameFactIds),
      readStore.readTaxonomyAssignments(food.foodId, selections.taxonomyAssignmentIds),
      readStore.readMarketAssignments(food.foodId, selections.marketAssignmentIds),
    ]);

    selectedFacts<StoredFoodServingOption>(selections.servingOptionIds, servings, food.foodId, "serving", findings);
    const selectedNames = selectedFacts<StoredFoodNameFact>(selections.nameFactIds, names, food.foodId, "name", findings);
    const selectedTaxonomy = selectedFacts<StoredFoodTaxonomyAssignment>(selections.taxonomyAssignmentIds, taxonomy, food.foodId, "taxonomy", findings);
    const selectedMarkets = selectedFacts<StoredFoodMarketAssignment>(selections.marketAssignmentIds, markets, food.foodId, "market", findings);

    for (const assignment of selectedTaxonomy) {
      if (assignment.action === "remove") {
        findings.push(finding("SELECTED_TAXONOMY_REMOVAL", food.foodId, assignment.id, {
          assignmentId: assignment.id,
          action: assignment.action,
        }));
      }
    }
    for (const assignment of selectedMarkets) {
      if (assignment.action === "remove") {
        findings.push(finding("SELECTED_MARKET_REMOVAL", food.foodId, assignment.id, {
          assignmentId: assignment.id,
          action: assignment.action,
        }));
      }
    }

    if (selections.verification.length > 0) {
      try {
        const assertions = await readStore.readVerificationAssertions(food.foodId, selections.verification);
        const byId = new Map(assertions.map((assertion) => [assertion.id, assertion]));
        for (const selection of selections.verification) {
          const assertion = byId.get(selection.assertionId);
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
      } catch (error) {
        findings.push(finding("INVALID_VERIFICATION_SELECTION", food.foodId, null, {
          message: error instanceof Error ? error.message : "verification selection could not be hydrated",
        }));
      }
    }

    if (food.lifecycle === "active") {
      if (!selectedNames.some((name) => name.role === "preferred_display")) {
        findings.push(finding("ACTIVE_FOOD_MISSING_DISPLAY_NAME", food.foodId, null, {
          selectedNameFactIds: selections.nameFactIds,
        }));
      }

      const authority = await readStore.readActivationAuthority(
        food.activationSetMemberId as string,
        food.activationGrantEventId as string,
      );
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
    if (redirect.generationId !== generationId) {
      throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", "Generation redirect escaped exact generation scope.");
    }
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

  const normalizedFindings = sortFindings(findings).map((entry, index) => ({
    ...entry,
    id: randomUUID(),
    findingOrdinal: index + 1,
  }));
  verificationStates.sort((left, right) => left.foodId.localeCompare(right.foodId)
    || left.scope.localeCompare(right.scope)
    || left.assertionId.localeCompare(right.assertionId));

  const blockerCount = normalizedFindings.filter((entry) => entry.blocking).length;
  const countSeverity = (severity: GenerationFindingSeverity) => normalizedFindings.filter((entry) => entry.severity === severity).length;
  const reportWithoutChecksum: Omit<GenerationValidationReport, "id" | "reportChecksumSha256"> = {
    generationId: generation.id,
    generationChecksumSha256: generation.compositionChecksumSha256,
    validatorSetVersion: GENERATION_VALIDATOR_SET_VERSION,
    policyVersion: generation.generationPolicyVersion,
    blockerCount,
    errorCount: countSeverity("error"),
    warningCount: countSeverity("warning"),
    infoCount: countSeverity("info"),
    findings: normalizedFindings,
    verificationStates,
  };

  return {
    id: randomUUID(),
    ...reportWithoutChecksum,
    reportChecksumSha256: sha256Canonical(reportSemanticPayload(reportWithoutChecksum)),
  };
}

function actorPayload(actor: ControlPlaneActorContext) {
  const value = validateControlPlaneActorContext(actor);
  return {
    principal_id: value.principalId,
    principal_type: value.principalType,
    authority_reference: value.authorityReference,
    reason_code: value.reasonCode,
    policy_version: value.policyVersion,
  };
}

export async function persistGenerationValidation(
  commandStore: FoodCatalogGenerationCommandStore,
  report: GenerationValidationReport,
  actor: ControlPlaneActorContext,
  operationId: string,
): Promise<GenerationCommandResult> {
  if (!operationId.trim()) {
    throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", "Validation operation ID must be nonblank.");
  }
  const payload = {
    report_id: report.id,
    generation_id: report.generationId,
    generation_checksum_sha256: report.generationChecksumSha256,
    validator_set_version: report.validatorSetVersion,
    policy_version: report.policyVersion,
    report_checksum_sha256: report.reportChecksumSha256,
    blocker_count: report.blockerCount,
    error_count: report.errorCount,
    warning_count: report.warningCount,
    info_count: report.infoCount,
    findings: report.findings.map((entry) => ({
      id: entry.id,
      finding_ordinal: entry.findingOrdinal,
      reason_code: entry.reasonCode,
      food_id: entry.foodId,
      severity: entry.severity,
      blocking: entry.blocking,
      evidence_reference: entry.evidenceReference,
      validator_policy_version: entry.validatorPolicyVersion,
      details: entry.details,
    })),
    actor: actorPayload(actor),
  };

  return commandStore.recordValidation({
    operationId,
    commandChecksumSha256: sha256Canonical({ operationKind: "record_generation_validation", payload }),
    payload,
  });
}
