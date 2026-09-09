import { describe, expect, it } from "vitest";
import {
  correctionEvidenceRequirement,
  freezeCorrectionPolicyVersion,
  validateCorrectionEvidence,
} from "./evidence";

const FOOD = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("Food Catalog Plan 6 correction evidence policy", () => {
  it("requires category-specific evidence for authoritative corrections", () => {
    expect(correctionEvidenceRequirement("wrong_nutrition")).toEqual({ required: true, allowed: ["source_record", "product_label", "manufacturer"] });
    expect(correctionEvidenceRequirement("wrong_barcode")).toEqual({ required: true, allowed: ["source_record", "product_label", "manufacturer", "barcode"] });
    expect(correctionEvidenceRequirement("duplicate_food").required).toBe(true);
    expect(correctionEvidenceRequirement("missing_nutrition").required).toBe(false);
  });

  it("rejects foreign source evidence and unsupported evidence classes", () => {
    expect(() => validateCorrectionEvidence({
      caseFoodId: FOOD,
      category: "wrong_nutrition",
      evidenceType: "source_record",
      sourceRecordId: "33333333-3333-4333-8333-333333333333",
      sourceRecordFoodId: OTHER,
      reference: null,
    })).toThrow(/same food/i);
    expect(() => validateCorrectionEvidence({
      caseFoodId: FOOD,
      category: "wrong_nutrition",
      evidenceType: "barcode",
      sourceRecordId: null,
      sourceRecordFoodId: null,
      reference: "member-barcode-scan",
    })).toThrow(/not allowed/i);
  });

  it("allows bounded non-source evidence only with an inspectable reference", () => {
    expect(validateCorrectionEvidence({
      caseFoodId: FOOD,
      category: "wrong_serving",
      evidenceType: "product_label",
      sourceRecordId: null,
      sourceRecordFoodId: null,
      reference: "label-photo-evidence:abc123",
    }).reference).toBe("label-photo-evidence:abc123");
    expect(() => validateCorrectionEvidence({
      caseFoodId: FOOD,
      category: "wrong_serving",
      evidenceType: "product_label",
      sourceRecordId: null,
      sourceRecordFoodId: null,
      reference: " ",
    })).toThrow(/reference/i);
  });

  it("freezes a correction case to its historical policy version", () => {
    expect(freezeCorrectionPolicyVersion(null, "plan6-v1")).toBe("plan6-v1");
    expect(freezeCorrectionPolicyVersion("plan6-v1", "plan6-v1")).toBe("plan6-v1");
    expect(() => freezeCorrectionPolicyVersion("plan6-v1", "plan6-v2")).toThrow(/frozen/i);
  });
});
