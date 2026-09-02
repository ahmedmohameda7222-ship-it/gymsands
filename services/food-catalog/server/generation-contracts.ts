import "server-only";

import type { ActivationEligibility } from "@/lib/food-catalog/domain/activation";
import type {
  ControlPlaneActorContext,
  GenerationEventType,
  GenerationFindingSeverity,
  GenerationLifecycle,
} from "@/lib/food-catalog/domain/generations";
import type { FoodVerificationScope, FoodVerificationState } from "@/lib/food-catalog/domain/verification";

export type StoredCurrentGenerationPointer = {
  currentGenerationId: string | null;
  currentEventId: string | null;
  currentValidationReportId: string | null;
  pointerRevision: number;
};

export type StoredCatalogGeneration = {
  id: string;
  baseGenerationId: string | null;
  generationOrdinal: number | null;
  compositionSchemaVersion: string;
  generationPolicyVersion: string;
  activationPolicyVersion: string;
  trustPolicyVersion: string;
  projectionVersion: string;
  changeManifestChecksumSha256: string;
  compositionChecksumSha256: string;
  authorityReference: string;
  createdAt: string;
  sealedAt: string;
};

export type StoredGenerationFood = {
  generationId: string;
  foodId: string;
  lifecycle: GenerationLifecycle;
  nutritionRevisionId: string | null;
  activationSetId: string | null;
  activationSetMemberId: string | null;
  activationGrantEventId: string | null;
};

export type StoredGenerationRedirect = {
  generationId: string;
  sourceFoodId: string;
  targetFoodId: string;
};

export type StoredGenerationVerificationSelection = {
  foodId: string;
  scope: FoodVerificationScope;
  assertionId: string;
};

export type StoredGenerationSelections = {
  servingOptionIds: string[];
  nameFactIds: string[];
  taxonomyAssignmentIds: string[];
  marketAssignmentIds: string[];
  verification: StoredGenerationVerificationSelection[];
};

export type StoredActivationAuthority = {
  activationSetId: string;
  activationSetMemberId: string;
  foodId: string;
  activationPolicyVersion: string;
  eligibility: ActivationEligibility;
  sourceLegalAccepted: boolean;
  grantEventId: string;
  grantCreatedAt: string;
  invalidatedAt: string | null;
};

export type StoredGenerationEvent = {
  id: string;
  operationId: string;
  eventType: GenerationEventType;
  fromGenerationId: string | null;
  toGenerationId: string | null;
  revokedGenerationId: string | null;
  generationChecksumSha256: string | null;
  validationReportId: string | null;
  actor: ControlPlaneActorContext;
  reasonCode: string;
  authorityReference: string;
  policyVersion: string;
  createdAt: string;
};

export type StoredGenerationValidationFinding = {
  id: string;
  reportId: string;
  reasonCode: string;
  foodId: string | null;
  severity: GenerationFindingSeverity;
  blocking: boolean;
  evidenceReference: string | null;
  validatorPolicyVersion: string;
  details: unknown;
};

export type StoredGenerationValidationReport = {
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
  createdAt: string;
};

export type StoredFoodVerificationSelectionState = {
  scope: FoodVerificationScope;
  assertionId: string;
  state: FoodVerificationState;
};

export type GenerationCommandResult = {
  operationId: string;
  eventId: string | null;
  generationId: string | null;
  validationReportId: string | null;
  pointerRevision: number | null;
};

export type CreateActivationSetCommand = {
  operationId: string;
  commandChecksumSha256: string;
  payload: unknown;
};

export type GrantActivationSetCommand = CreateActivationSetCommand;
export type InvalidateActivationGrantCommand = CreateActivationSetCommand;
export type CreateGenerationCommand = CreateActivationSetCommand;
export type RecordGenerationValidationCommand = CreateActivationSetCommand;
export type PromoteGenerationCommand = CreateActivationSetCommand;
export type RollbackGenerationCommand = CreateActivationSetCommand;
export type RevokeGenerationCommand = CreateActivationSetCommand;
