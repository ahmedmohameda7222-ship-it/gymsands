import { validateCorrectionTransition, type FoodCorrectionState } from "./corrections";
import {
  assertFoodGovernanceCapability,
  type FoodGovernanceCapability,
  type FoodGovernancePrincipal,
} from "./principals";

function capabilityForTransition(
  from: FoodCorrectionState,
  to: FoodCorrectionState,
): FoodGovernanceCapability {
  if (from === "reported" && to === "under_review") return "food.correction.review";
  if (to === "approved") return "food.correction.approve";
  if (to === "rejected") return "food.correction.review";
  if (from === "approved" && to === "applied") return "food.correction.apply";
  throw new Error(`Invalid correction transition capability mapping: ${from} -> ${to}`);
}

export function authorizeCorrectionTransition(input: {
  principal: FoodGovernancePrincipal;
  from: FoodCorrectionState;
  to: FoodCorrectionState;
  expectedRevision: number;
  actualRevision: number;
  evidenceRequired: boolean;
  evidenceCount: number;
  viaCanonicalApplyCommand: boolean;
}) {
  validateCorrectionTransition(input.from, input.to);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      || !Number.isSafeInteger(input.actualRevision) || input.actualRevision < 0) {
    throw new Error("Correction state revision must be a non-negative safe integer.");
  }
  if (input.expectedRevision !== input.actualRevision) {
    throw new Error("Correction case CAS conflict: state revision changed.");
  }
  if (input.to === "approved" && input.evidenceRequired && input.evidenceCount < 1) {
    throw new Error("Correction approval requires category-policy evidence.");
  }
  if (input.from === "approved" && input.to === "applied" && !input.viaCanonicalApplyCommand) {
    throw new Error("Approved correction cases may become applied only inside a canonical apply command.");
  }
  assertFoodGovernanceCapability(input.principal, capabilityForTransition(input.from, input.to));
  return {
    from: input.from,
    to: input.to,
    previousRevision: input.actualRevision,
    nextRevision: input.actualRevision + 1,
  } as const;
}
