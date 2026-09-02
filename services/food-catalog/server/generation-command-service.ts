import "server-only";

import {
  validateControlPlaneActorContext,
  type ControlPlaneActorContext,
} from "@/lib/food-catalog/domain/generations";

import { sha256Canonical } from "./canonical-hash";
import type { GenerationCommandResult } from "./generation-contracts";
import type { FoodCatalogGenerationCommandStore } from "./generation-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

export type PromoteCatalogGenerationInput = {
  operationId: string;
  generationId: string;
  expectedCurrentGenerationId: string | null;
  generationChecksumSha256: string;
  validationReportId: string;
  validationReportChecksumSha256: string;
  actor: ControlPlaneActorContext;
};

export type RollbackCatalogGenerationInput = {
  operationId: string;
  expectedCurrentGenerationId: string;
  targetGenerationId: string;
  targetGenerationChecksumSha256: string;
  targetPromotionEventId: string;
  targetValidationReportId: string;
  targetValidationReportChecksumSha256: string;
  actor: ControlPlaneActorContext;
};

export type RevokeCatalogGenerationInput = {
  operationId: string;
  generationId: string;
  generationChecksumSha256: string;
  actor: ControlPlaneActorContext;
};

function requireUuid(value: string, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error(`${label} must be an exact UUID.`);
  }
  return value.toLowerCase();
}

function requireChecksum(value: string, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be lowercase SHA-256 hex.`);
  }
  return value;
}

function canonicalActor(actor: ControlPlaneActorContext): ControlPlaneActorContext {
  const value = validateControlPlaneActorContext(actor);
  return {
    principalId: value.principalId,
    principalType: value.principalType,
    authorityReference: value.authorityReference,
    reasonCode: value.reasonCode,
    policyVersion: value.policyVersion,
  };
}

function persistedActor(actor: ControlPlaneActorContext) {
  return {
    principal_id: actor.principalId,
    principal_type: actor.principalType,
    authority_reference: actor.authorityReference,
    reason_code: actor.reasonCode,
    policy_version: actor.policyVersion,
  };
}

export async function promoteCatalogGeneration(
  commandStore: FoodCatalogGenerationCommandStore,
  input: PromoteCatalogGenerationInput,
): Promise<GenerationCommandResult> {
  const operationId = requireUuid(input.operationId, "Promotion operation ID");
  const generationId = requireUuid(input.generationId, "Promotion generation ID");
  if (input.expectedCurrentGenerationId === undefined) {
    throw new Error("Promotion expected current generation ID must be explicit, including null bootstrap.");
  }
  const expectedCurrentGenerationId = input.expectedCurrentGenerationId === null
    ? null
    : requireUuid(input.expectedCurrentGenerationId, "Promotion expected current generation ID");
  const generationChecksumSha256 = requireChecksum(
    input.generationChecksumSha256,
    "Promotion generation checksum",
  );
  const validationReportId = requireUuid(input.validationReportId, "Promotion validation report ID");
  const validationReportChecksumSha256 = requireChecksum(
    input.validationReportChecksumSha256,
    "Promotion validation report checksum",
  );
  const actor = canonicalActor(input.actor);

  const semanticPayload = {
    generationId,
    expectedCurrentGenerationId,
    generationChecksumSha256,
    validationReportId,
    validationReportChecksumSha256,
    actor,
  };

  return commandStore.promoteGeneration({
    operationId,
    commandChecksumSha256: sha256Canonical(semanticPayload),
    payload: {
      candidate_generation_id: generationId,
      expected_current_generation_id: expectedCurrentGenerationId,
      candidate_checksum_sha256: generationChecksumSha256,
      validation_report_id: validationReportId,
      validation_report_checksum_sha256: validationReportChecksumSha256,
      actor: persistedActor(actor),
    },
  });
}

export async function rollbackCatalogGeneration(
  commandStore: FoodCatalogGenerationCommandStore,
  input: RollbackCatalogGenerationInput,
): Promise<GenerationCommandResult> {
  const operationId = requireUuid(input.operationId, "Rollback operation ID");
  if (input.expectedCurrentGenerationId === null || input.expectedCurrentGenerationId === undefined) {
    throw new Error("Rollback expected current generation ID must be an explicit non-null UUID.");
  }
  const expectedCurrentGenerationId = requireUuid(
    input.expectedCurrentGenerationId,
    "Rollback expected current generation ID",
  );
  const targetGenerationId = requireUuid(input.targetGenerationId, "Rollback target generation ID");
  const targetGenerationChecksumSha256 = requireChecksum(
    input.targetGenerationChecksumSha256,
    "Rollback target generation checksum",
  );
  const targetPromotionEventId = requireUuid(
    input.targetPromotionEventId,
    "Rollback target promotion event ID",
  );
  const targetValidationReportId = requireUuid(
    input.targetValidationReportId,
    "Rollback target validation report ID",
  );
  const targetValidationReportChecksumSha256 = requireChecksum(
    input.targetValidationReportChecksumSha256,
    "Rollback target validation report checksum",
  );
  const actor = canonicalActor(input.actor);

  const semanticPayload = {
    expectedCurrentGenerationId,
    targetGenerationId,
    targetGenerationChecksumSha256,
    targetPromotionEventId,
    targetValidationReportId,
    targetValidationReportChecksumSha256,
    actor,
  };

  return commandStore.rollbackGeneration({
    operationId,
    commandChecksumSha256: sha256Canonical(semanticPayload),
    payload: {
      expected_current_generation_id: expectedCurrentGenerationId,
      target_generation_id: targetGenerationId,
      target_checksum_sha256: targetGenerationChecksumSha256,
      target_promotion_event_id: targetPromotionEventId,
      target_validation_report_id: targetValidationReportId,
      target_validation_report_checksum_sha256: targetValidationReportChecksumSha256,
      actor: persistedActor(actor),
    },
  });
}

export async function revokeCatalogGeneration(
  commandStore: FoodCatalogGenerationCommandStore,
  input: RevokeCatalogGenerationInput,
): Promise<GenerationCommandResult> {
  const operationId = requireUuid(input.operationId, "Revocation operation ID");
  const generationId = requireUuid(input.generationId, "Revocation generation ID");
  const generationChecksumSha256 = requireChecksum(
    input.generationChecksumSha256,
    "Revocation generation checksum",
  );
  const actor = canonicalActor(input.actor);

  const semanticPayload = {
    generationId,
    generationChecksumSha256,
    actor,
  };

  return commandStore.revokeGeneration({
    operationId,
    commandChecksumSha256: sha256Canonical(semanticPayload),
    payload: {
      generation_id: generationId,
      generation_checksum_sha256: generationChecksumSha256,
      actor: persistedActor(actor),
    },
  });
}
