import "server-only";

import {
  validateActivationSetMemberDraft,
  type ActivationSetMemberDraft,
} from "@/lib/food-catalog/domain/activation";
import {
  validateControlPlaneActorContext,
  type ControlPlaneActorContext,
} from "@/lib/food-catalog/domain/generations";
import { sha256Canonical } from "./canonical-hash";
import type { GenerationCommandResult } from "./generation-contracts";
import type { FoodCatalogGenerationCommandStore } from "./generation-store";

export type ActivationManifestMember = ActivationSetMemberDraft & {
  id: string;
};

export type ActivationManifestInput = {
  manifestSchemaVersion: string;
  activationPolicyVersion: string;
  members: readonly ActivationManifestMember[];
};

export type ActivationManifest = {
  manifestSchemaVersion: string;
  activationPolicyVersion: string;
  members: ActivationManifestMember[];
  manifestChecksumSha256: string;
};

export type ActivationCommandContext = {
  operationId: string;
  commandChecksumSha256: string;
  activationSetId: string;
  eventId?: string;
  actor: ControlPlaneActorContext;
};

export type CreateActivationSetInput = ActivationManifestInput & ActivationCommandContext;
export type GrantActivationSetInput = ActivationCommandContext & {
  members: readonly ActivationManifestMember[];
};
export type InvalidateActivationGrantInput = ActivationCommandContext & {
  targetGrantEventId: string;
};

const SHA256 = /^[0-9a-f]{64}$/;

function requireNonblank(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be nonblank.`);
  }
  return value;
}

function requireChecksum(value: string, label: string): string {
  requireNonblank(value, label);
  if (!SHA256.test(value)) {
    throw new Error(`${label} must be lowercase SHA-256 hex.`);
  }
  return value;
}

function validateMember(member: ActivationManifestMember): ActivationManifestMember {
  requireNonblank(member.id, "Activation member ID");
  validateActivationSetMemberDraft(member);
  return member;
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

function validateCommandContext(input: ActivationCommandContext): void {
  requireNonblank(input.operationId, "Activation operation ID");
  requireChecksum(input.commandChecksumSha256, "Activation command checksum");
  requireNonblank(input.activationSetId, "Activation set ID");
  if (input.eventId !== undefined) requireNonblank(input.eventId, "Activation event ID");
  validateControlPlaneActorContext(input.actor);
}

function persistedMember(member: ActivationManifestMember) {
  return {
    id: member.id,
    food_id: member.foodId,
    expected_precondition_lifecycle: member.expectedPreconditionLifecycle,
    evidence_reference: member.evidenceReference,
    evidence_checksum_sha256: member.evidenceChecksumSha256,
    source_legal_accepted: member.sourceLegalAccepted,
    identity_resolved: member.identityResolved,
    nutrition_basis_valid: member.nutritionBasisValid,
    display_identity_valid: member.displayIdentityValid,
    blocking_condition_count: member.blockingConditionCount,
    eligibility: member.eligibility,
    member_checksum_sha256: member.memberChecksumSha256,
  };
}

export function buildActivationManifest(input: ActivationManifestInput): ActivationManifest {
  const manifestSchemaVersion = requireNonblank(input.manifestSchemaVersion, "Activation manifest schema version");
  const activationPolicyVersion = requireNonblank(input.activationPolicyVersion, "Activation policy version");
  if (!Array.isArray(input.members) || input.members.length === 0) {
    throw new Error("Activation manifest requires at least one member.");
  }

  const members = input.members.map(validateMember).sort((left, right) => left.foodId.localeCompare(right.foodId));
  const seenFoodIds = new Set<string>();
  for (const member of members) {
    if (seenFoodIds.has(member.foodId)) {
      throw new Error(`Activation manifest contains duplicate Food ID ${member.foodId}.`);
    }
    seenFoodIds.add(member.foodId);
  }

  const checksumPayload = {
    manifestSchemaVersion,
    activationPolicyVersion,
    members: members.map((member) => ({
      foodId: member.foodId,
      expectedPreconditionLifecycle: member.expectedPreconditionLifecycle,
      evidenceReference: member.evidenceReference,
      evidenceChecksumSha256: member.evidenceChecksumSha256,
      sourceLegalAccepted: member.sourceLegalAccepted,
      identityResolved: member.identityResolved,
      nutritionBasisValid: member.nutritionBasisValid,
      displayIdentityValid: member.displayIdentityValid,
      blockingConditionCount: member.blockingConditionCount,
      eligibility: member.eligibility,
      memberChecksumSha256: member.memberChecksumSha256,
    })),
  };

  return {
    manifestSchemaVersion,
    activationPolicyVersion,
    members,
    manifestChecksumSha256: sha256Canonical(checksumPayload),
  };
}

export async function createActivationSet(
  commandStore: FoodCatalogGenerationCommandStore,
  input: CreateActivationSetInput,
): Promise<GenerationCommandResult> {
  validateCommandContext(input);
  const manifest = buildActivationManifest(input);
  return commandStore.createActivationSet({
    operationId: input.operationId,
    commandChecksumSha256: input.commandChecksumSha256,
    payload: {
      activation_set_id: input.activationSetId,
      ...(input.eventId === undefined ? {} : { event_id: input.eventId }),
      manifest_schema_version: manifest.manifestSchemaVersion,
      activation_policy_version: manifest.activationPolicyVersion,
      manifest_checksum_sha256: manifest.manifestChecksumSha256,
      actor: actorPayload(input.actor),
      members: manifest.members.map(persistedMember),
    },
  });
}

export async function grantActivationSet(
  commandStore: FoodCatalogGenerationCommandStore,
  input: GrantActivationSetInput,
): Promise<GenerationCommandResult> {
  validateCommandContext(input);
  if (!Array.isArray(input.members) || input.members.length === 0) {
    throw new Error("Activation grant requires reviewed members.");
  }
  const members = input.members.map(validateMember);
  if (members.some((member) => member.eligibility !== "eligible")) {
    throw new Error("Activation grant requires every reviewed member to be eligible.");
  }

  return commandStore.grantActivationSet({
    operationId: input.operationId,
    commandChecksumSha256: input.commandChecksumSha256,
    payload: {
      activation_set_id: input.activationSetId,
      ...(input.eventId === undefined ? {} : { event_id: input.eventId }),
      actor: actorPayload(input.actor),
    },
  });
}

export async function invalidateActivationGrant(
  commandStore: FoodCatalogGenerationCommandStore,
  input: InvalidateActivationGrantInput,
): Promise<GenerationCommandResult> {
  validateCommandContext(input);
  const targetGrantEventId = requireNonblank(input.targetGrantEventId, "Activation target grant event ID");
  return commandStore.invalidateActivationGrant({
    operationId: input.operationId,
    commandChecksumSha256: input.commandChecksumSha256,
    payload: {
      activation_set_id: input.activationSetId,
      ...(input.eventId === undefined ? {} : { event_id: input.eventId }),
      target_grant_event_id: targetGrantEventId,
      actor: actorPayload(input.actor),
    },
  });
}
