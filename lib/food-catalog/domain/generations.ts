import type { FoodVerificationScope } from "./verification";

export type GenerationLifecycle = "active" | "deprecated" | "withdrawn";
export type GenerationEventType = "created" | "validated" | "promote" | "rollback" | "revoke";
export type GenerationFindingSeverity = "info" | "warning" | "error";
export type ControlPlanePrincipalType = "human" | "service";

export type ControlPlaneActorContext = {
  principalId: string;
  principalType: ControlPlanePrincipalType;
  authorityReference: string;
  reasonCode: string;
  policyVersion: string;
};

export type GenerationFoodSelection = {
  foodId: string;
  lifecycle: GenerationLifecycle;
  nutritionRevisionId: string | null;
  activationSetId: string | null;
  activationSetMemberId: string | null;
  activationGrantEventId: string | null;
};

export type GenerationRedirectSelection = {
  sourceFoodId: string;
  targetFoodId: string;
};

export type GenerationVerificationSelection = {
  foodId: string;
  scope: FoodVerificationScope;
  assertionId: string;
};

export type GenerationValidationFinding = {
  reasonCode: string;
  foodId: string | null;
  severity: GenerationFindingSeverity;
  blocking: boolean;
  evidenceReference: string | null;
  validatorPolicyVersion: string;
  details: unknown;
};

const GENERATION_LIFECYCLES = new Set<GenerationLifecycle>([
  "active",
  "deprecated",
  "withdrawn",
]);
const GENERATION_FINDING_SEVERITIES = new Set<GenerationFindingSeverity>([
  "info",
  "warning",
  "error",
]);
const CONTROL_PLANE_PRINCIPAL_TYPES = new Set<ControlPlanePrincipalType>(["human", "service"]);
const FOOD_VERIFICATION_SCOPES = new Set<FoodVerificationScope>([
  "identity",
  "nutrition",
  "serving",
  "barcode",
  "localization",
]);

function requireNonblank(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be nonblank.`);
  }
}

function requireNullableNonblank(value: string | null, label: string): void {
  if (value !== null) requireNonblank(value, label);
}

export function validateControlPlaneActorContext(
  value: ControlPlaneActorContext,
): ControlPlaneActorContext {
  requireNonblank(value.principalId, "Control-plane principal ID");
  if (!CONTROL_PLANE_PRINCIPAL_TYPES.has(value.principalType)) {
    throw new Error("Control-plane principal type is invalid.");
  }
  requireNonblank(value.authorityReference, "Control-plane authority reference");
  requireNonblank(value.reasonCode, "Control-plane reason code");
  requireNonblank(value.policyVersion, "Control-plane policy version");
  return value;
}

export function validateGenerationFoodSelection(
  value: GenerationFoodSelection,
): GenerationFoodSelection {
  requireNonblank(value.foodId, "Generation Food ID");
  if (!GENERATION_LIFECYCLES.has(value.lifecycle)) {
    throw new Error("Generation Food lifecycle is invalid; draft and merged are not generation lifecycle states.");
  }
  requireNullableNonblank(value.nutritionRevisionId, "Generation nutrition revision ID");

  const activationRefs = [
    value.activationSetId,
    value.activationSetMemberId,
    value.activationGrantEventId,
  ];
  if (value.lifecycle === "active") {
    if (activationRefs.some((entry) => entry === null || !entry.trim())) {
      throw new Error("Active generation Foods require exact activation set, member, and grant authority.");
    }
  } else if (activationRefs.some((entry) => entry !== null)) {
    throw new Error("Non-active generation Foods must not carry activation authority references.");
  }

  return value;
}

export function validateGenerationRedirectSelection(
  value: GenerationRedirectSelection,
): GenerationRedirectSelection {
  requireNonblank(value.sourceFoodId, "Generation redirect source Food ID");
  requireNonblank(value.targetFoodId, "Generation redirect target Food ID");
  if (value.sourceFoodId === value.targetFoodId) {
    throw new Error("Generation redirect cannot be a self redirect.");
  }
  return value;
}

export function validateGenerationVerificationSelection(
  value: GenerationVerificationSelection,
): GenerationVerificationSelection {
  requireNonblank(value.foodId, "Generation verification Food ID");
  if (!FOOD_VERIFICATION_SCOPES.has(value.scope)) {
    throw new Error("Generation verification scope is invalid.");
  }
  requireNonblank(value.assertionId, "Generation verification assertion ID");
  return value;
}

export function validateGenerationValidationFinding(
  value: GenerationValidationFinding,
): GenerationValidationFinding {
  requireNonblank(value.reasonCode, "Generation validation reason code");
  requireNullableNonblank(value.foodId, "Generation validation Food ID");
  if (!GENERATION_FINDING_SEVERITIES.has(value.severity)) {
    throw new Error("Generation validation severity is invalid.");
  }
  requireNullableNonblank(value.evidenceReference, "Generation validation evidence reference");
  requireNonblank(value.validatorPolicyVersion, "Generation validator policy version");
  return value;
}
