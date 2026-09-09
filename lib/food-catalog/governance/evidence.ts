import type { FoodCorrectionCategory } from "./corrections";

export const FOOD_CORRECTION_EVIDENCE_TYPES = [
  "source_record",
  "product_label",
  "manufacturer",
  "barcode",
  "canonical",
  "curator_reason",
] as const;
export type FoodCorrectionEvidenceType = (typeof FOOD_CORRECTION_EVIDENCE_TYPES)[number];

const POLICIES: Readonly<Record<FoodCorrectionCategory, Readonly<{
  required: boolean;
  allowed: readonly FoodCorrectionEvidenceType[];
}>>> = Object.freeze({
  wrong_nutrition: { required: true, allowed: ["source_record", "product_label", "manufacturer"] },
  missing_nutrition: { required: false, allowed: ["source_record", "product_label", "manufacturer", "curator_reason"] },
  wrong_serving: { required: true, allowed: ["source_record", "product_label", "manufacturer"] },
  missing_serving: { required: false, allowed: ["source_record", "product_label", "manufacturer", "curator_reason"] },
  wrong_name: { required: true, allowed: ["source_record", "product_label", "manufacturer", "canonical"] },
  wrong_translation: { required: true, allowed: ["source_record", "product_label", "manufacturer", "canonical"] },
  wrong_barcode: { required: true, allowed: ["source_record", "product_label", "manufacturer", "barcode"] },
  wrong_taxonomy: { required: true, allowed: ["source_record", "canonical", "curator_reason"] },
  wrong_market_relevance: { required: true, allowed: ["source_record", "manufacturer", "canonical", "curator_reason"] },
  duplicate_food: { required: true, allowed: ["source_record", "product_label", "manufacturer", "barcode", "canonical"] },
  wrong_variant: { required: true, allowed: ["source_record", "product_label", "manufacturer", "barcode"] },
  outdated_product: { required: true, allowed: ["source_record", "manufacturer", "canonical"] },
  source_conflict: { required: true, allowed: ["source_record", "product_label", "manufacturer", "canonical"] },
  other: { required: false, allowed: ["source_record", "product_label", "manufacturer", "barcode", "canonical", "curator_reason"] },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function correctionEvidenceRequirement(category: FoodCorrectionCategory) {
  return POLICIES[category];
}

export function validateCorrectionEvidence(input: {
  caseFoodId: string;
  category: FoodCorrectionCategory;
  evidenceType: FoodCorrectionEvidenceType;
  sourceRecordId: string | null;
  sourceRecordFoodId: string | null;
  reference: string | null;
}) {
  if (!UUID.test(input.caseFoodId)) throw new Error("Correction case Food ID must be an exact UUID.");
  const policy = correctionEvidenceRequirement(input.category);
  if (!policy.allowed.includes(input.evidenceType)) {
    throw new Error(`Evidence type ${input.evidenceType} is not allowed for ${input.category}.`);
  }
  if (input.sourceRecordId !== null) {
    if (!UUID.test(input.sourceRecordId)) throw new Error("Correction source record ID must be an exact UUID.");
    if (!input.sourceRecordFoodId || input.sourceRecordFoodId.toLowerCase() !== input.caseFoodId.toLowerCase()) {
      throw new Error("Source-record correction evidence must belong to the same Food.");
    }
  } else {
    const reference = input.reference?.trim() ?? "";
    if (!reference) throw new Error("Inspectable correction evidence reference is required.");
    if (reference.length > 500) throw new Error("Correction evidence reference must remain bounded.");
  }
  return {
    ...input,
    caseFoodId: input.caseFoodId.toLowerCase(),
    sourceRecordId: input.sourceRecordId?.toLowerCase() ?? null,
    sourceRecordFoodId: input.sourceRecordFoodId?.toLowerCase() ?? null,
    reference: input.reference?.trim() || null,
  };
}

export function freezeCorrectionPolicyVersion(
  currentPolicyVersion: string | null,
  requestedPolicyVersion: string,
) {
  const requested = requestedPolicyVersion.trim();
  if (!requested) throw new Error("Correction policy version is required.");
  if (currentPolicyVersion !== null && currentPolicyVersion !== requested) {
    throw new Error(`Correction policy is frozen to historical version ${currentPolicyVersion}.`);
  }
  return currentPolicyVersion ?? requested;
}
