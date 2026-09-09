import { describe, expect, it } from "vitest";
import {
  FOOD_CORRECTION_CATEGORIES,
  FOOD_CORRECTION_STATES,
  buildCorrectionIssueKey,
  validateCorrectionReport,
  validateCorrectionTransition,
} from "./corrections";

const FOOD_ID = "11111111-1111-4111-8111-111111111111";

describe("Food Catalog Plan 6 correction cases", () => {
  it("covers every bounded Plan 6 correction category", () => {
    expect(FOOD_CORRECTION_CATEGORIES).toEqual([
      "wrong_nutrition",
      "missing_nutrition",
      "wrong_serving",
      "missing_serving",
      "wrong_name",
      "wrong_translation",
      "wrong_barcode",
      "wrong_taxonomy",
      "wrong_market_relevance",
      "duplicate_food",
      "wrong_variant",
      "outdated_product",
      "source_conflict",
      "other",
    ]);
    expect(FOOD_CORRECTION_STATES).toEqual(["reported", "under_review", "approved", "applied", "rejected"]);
  });

  it("builds a deterministic normalized issue join key", () => {
    expect(buildCorrectionIssueKey({ foodId: FOOD_ID, category: "wrong_name", claimKey: "  EN:Preferred Name  " }))
      .toBe(`${FOOD_ID}|wrong_name|en:preferred name`);
  });

  it("keeps member reports bounded and report-only", () => {
    const report = validateCorrectionReport({
      foodId: FOOD_ID,
      category: "wrong_nutrition",
      claimKey: "nutrition:label",
      description: "Package label differs from canonical nutrition.",
      evidence: { labelText: "100 kcal", source: "member_photo_reference" },
    });
    expect(report.foodId).toBe(FOOD_ID);
    expect(report.issueKey).toContain("wrong_nutrition");
    expect(report).not.toHaveProperty("canonicalMutation");
    expect(() => validateCorrectionReport({
      foodId: FOOD_ID,
      category: "other",
      claimKey: "other",
      description: "x".repeat(2001),
      evidence: {},
    })).toThrow(/2000/i);
  });

  it("rejects sensitive or unbounded member evidence payloads", () => {
    expect(() => validateCorrectionReport({
      foodId: FOOD_ID,
      category: "other",
      claimKey: "other",
      description: "Issue",
      evidence: { accessToken: "secret" },
    })).toThrow(/sensitive/i);
    expect(() => validateCorrectionReport({
      foodId: FOOD_ID,
      category: "other",
      claimKey: "other",
      description: "Issue",
      evidence: { note: "x".repeat(4097) },
    })).toThrow(/bounded/i);
  });

  it("enforces the controlled correction lifecycle and denies shortcuts", () => {
    expect(validateCorrectionTransition("reported", "under_review")).toEqual({ from: "reported", to: "under_review" });
    expect(validateCorrectionTransition("under_review", "approved")).toEqual({ from: "under_review", to: "approved" });
    expect(validateCorrectionTransition("approved", "applied")).toEqual({ from: "approved", to: "applied" });
    expect(validateCorrectionTransition("reported", "rejected")).toEqual({ from: "reported", to: "rejected" });
    expect(validateCorrectionTransition("under_review", "rejected")).toEqual({ from: "under_review", to: "rejected" });
    expect(() => validateCorrectionTransition("reported", "applied")).toThrow(/invalid/i);
    expect(() => validateCorrectionTransition("rejected", "under_review")).toThrow(/invalid/i);
  });
});
