import "server-only";

import { randomUUID } from "node:crypto";

import {
  validateControlPlaneActorContext,
  type ControlPlaneActorContext,
  type GenerationValidationFinding,
} from "@/lib/food-catalog/domain/generations";
import type { FoodVerificationScope, FoodVerificationState } from "@/lib/food-catalog/domain/verification";
import {
  GENERATION_BLOCKING_REASONS,
  GENERATION_VALIDATOR_SET_VERSION,
  validateGenerationSemanticSnapshot,
  type GenerationBlockingReason,
  type GenerationValidationSnapshot,
} from "@/lib/food-catalog/generation-validation-core";
import { computeGenerationValidationReportChecksum } from "@/lib/food-catalog/generation-validation-report";
import { sha256Canonical } from "./canonical-hash";
import { FoodCatalogGenerationError } from "./generation-errors";
import type { GenerationCommandResult } from "./generation-contracts";
import type {
  FoodCatalogGenerationCommandStore,
  FoodCatalogGenerationReadStore,
  FoodCatalogGenerationValidationReadStore,
} from "./generation-store";

export { GENERATION_BLOCKING_REASONS, GENERATION_VALIDATOR_SET_VERSION };
export type { GenerationBlockingReason };

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

function requireValidationReadStore(readStore: FoodCatalogGenerationReadStore): asserts readStore is FoodCatalogGenerationValidationReadStore {
  if (typeof readStore.readGenerationFoods !== "function" || typeof readStore.readGenerationRedirects !== "function") {
    throw new FoodCatalogGenerationError(
      "CONTROL_PLANE_REJECTED",
      "Generation validation requires exact generation-scoped Food and redirect enumeration capability.",
    );
  }
}

export async function validateStoredGeneration(
  readStore: FoodCatalogGenerationReadStore,
  generationId: string,
  expectedChecksum: string,
): Promise<GenerationValidationReport> {
  requireValidationReadStore(readStore);
  const generation = await readStore.readGeneration(generationId);
  if (!generation) {
    throw new FoodCatalogGenerationError("GENERATION_NOT_FOUND", `Catalog Generation ${generationId} does not exist.`);
  }

  const foods = await readStore.readGenerationFoods(generationId);
  const redirects = await readStore.readGenerationRedirects(generationId);
  for (const food of foods) {
    if (food.generationId !== generationId) {
      throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", "Generation Food escaped exact generation scope.");
    }
  }
  for (const redirect of redirects) {
    if (redirect.generationId !== generationId) {
      throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", "Generation redirect escaped exact generation scope.");
    }
  }

  const bulkHydration = typeof readStore.readGenerationValidationHydration === "function"
    ? await readStore.readGenerationValidationHydration(generationId, foods)
    : null;

  const selectionsByFoodId: Record<string, Awaited<ReturnType<typeof readStore.readGenerationSelections>>> = {};
  const nutritionRevisions: Array<{ id: string; foodId: string }> = [];
  const servingOptions: Array<{ id: string; foodId: string }> = [];
  const names: Array<{ id: string; foodId: string; role: string }> = [];
  const taxonomyAssignments: Array<{ id: string; foodId: string; action: string }> = [];
  const marketAssignments: Array<{ id: string; foodId: string; action: string }> = [];
  const verificationAssertions: Array<{ id: string; foodId: string; scope: FoodVerificationScope; state: FoodVerificationState }> = [];
  const activationAuthorities: GenerationValidationSnapshot["activationAuthorities"][number][] = [];
  const verificationReadErrorsByFoodId: Record<string, string> = {};

  if (bulkHydration !== null) {
    for (const food of foods) {
      const selections = bulkHydration.selectionsByFoodId[food.foodId];
      if (!selections) {
        throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", `Bulk validation hydration omitted generation Food ${food.foodId}.`);
      }
      selectionsByFoodId[food.foodId] = selections;
    }
    nutritionRevisions.push(...bulkHydration.nutritionRevisions);
    servingOptions.push(...bulkHydration.servingOptions);
    names.push(...bulkHydration.names.map((row) => ({ id: row.id, foodId: row.foodId, role: row.role })));
    taxonomyAssignments.push(...bulkHydration.taxonomyAssignments.map((row) => ({ id: row.id, foodId: row.foodId, action: row.action })));
    marketAssignments.push(...bulkHydration.marketAssignments.map((row) => ({ id: row.id, foodId: row.foodId, action: row.action })));
    verificationAssertions.push(...bulkHydration.verificationAssertions);
    activationAuthorities.push(...bulkHydration.activationAuthorities);
  } else {
    for (const food of foods) {
      const selections = await readStore.readGenerationSelections(generationId, food.foodId);
      selectionsByFoodId[food.foodId] = selections;

      if (food.nutritionRevisionId !== null) {
        const nutrition = await readStore.readNutritionRevision(food.foodId, food.nutritionRevisionId);
        if (nutrition) nutritionRevisions.push({ id: nutrition.id, foodId: nutrition.foodId });
      }

      const [servings, selectedNames, taxonomy, markets] = await Promise.all([
        readStore.readServingOptions(food.foodId, selections.servingOptionIds),
        readStore.readNames(food.foodId, selections.nameFactIds),
        readStore.readTaxonomyAssignments(food.foodId, selections.taxonomyAssignmentIds),
        readStore.readMarketAssignments(food.foodId, selections.marketAssignmentIds),
      ]);
      servingOptions.push(...servings.map((row) => ({ id: row.id, foodId: row.foodId })));
      names.push(...selectedNames.map((row) => ({ id: row.id, foodId: row.foodId, role: row.role })));
      taxonomyAssignments.push(...taxonomy.map((row) => ({ id: row.id, foodId: row.foodId, action: row.action })));
      marketAssignments.push(...markets.map((row) => ({ id: row.id, foodId: row.foodId, action: row.action })));

      if (selections.verification.length > 0) {
        try {
          const assertions = await readStore.readVerificationAssertions(food.foodId, selections.verification);
          verificationAssertions.push(...assertions.map((row) => ({
            id: row.id,
            foodId: row.foodId,
            scope: row.scope,
            state: row.state,
          })));
        } catch (error) {
          verificationReadErrorsByFoodId[food.foodId] = error instanceof Error
            ? error.message
            : "verification selection could not be hydrated";
        }
      }

      if (food.lifecycle === "active") {
        const authority = await readStore.readActivationAuthority(
          food.activationSetMemberId as string,
          food.activationGrantEventId as string,
        );
        if (authority) activationAuthorities.push(authority);
      }
    }
  }

  let semantic;
  try {
    semantic = validateGenerationSemanticSnapshot({
      generation: {
        id: generation.id,
        compositionSchemaVersion: generation.compositionSchemaVersion,
        generationPolicyVersion: generation.generationPolicyVersion,
        activationPolicyVersion: generation.activationPolicyVersion,
        trustPolicyVersion: generation.trustPolicyVersion,
        projectionVersion: generation.projectionVersion,
        compositionChecksumSha256: generation.compositionChecksumSha256,
        sealedAt: generation.sealedAt,
      },
      foods,
      redirects,
      selectionsByFoodId,
      nutritionRevisions,
      servingOptions,
      names,
      taxonomyAssignments,
      marketAssignments,
      verificationAssertions,
      activationAuthorities,
      verificationReadErrorsByFoodId,
    }, expectedChecksum);
  } catch (error) {
    throw new FoodCatalogGenerationError(
      "CONTROL_PLANE_REJECTED",
      error instanceof Error ? error.message : "Generation semantic validation failed.",
    );
  }

  const normalizedFindings = semantic.findings.map((entry, index) => ({
    ...entry,
    id: randomUUID(),
    findingOrdinal: index + 1,
  }));
  const reportWithoutChecksum: Omit<GenerationValidationReport, "id" | "reportChecksumSha256"> = {
    generationId: generation.id,
    generationChecksumSha256: generation.compositionChecksumSha256,
    validatorSetVersion: GENERATION_VALIDATOR_SET_VERSION,
    policyVersion: generation.generationPolicyVersion,
    blockerCount: semantic.blockerCount,
    errorCount: semantic.errorCount,
    warningCount: semantic.warningCount,
    infoCount: semantic.infoCount,
    findings: normalizedFindings,
    verificationStates: semantic.verificationStates.map((entry) => ({ ...entry })),
  };

  return {
    id: randomUUID(),
    ...reportWithoutChecksum,
    reportChecksumSha256: computeGenerationValidationReportChecksum(reportWithoutChecksum),
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
