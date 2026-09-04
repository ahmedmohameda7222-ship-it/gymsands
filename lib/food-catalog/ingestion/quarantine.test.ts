import { describe, expect, it } from "vitest";
import type { FoodCatalogCanonicalDecision, FoodCatalogValidationIssue } from "./contracts";
import { deriveProcessingDisposition } from "./quarantine";

const disposition = (
  decision: FoodCatalogCanonicalDecision,
  issues: FoodCatalogValidationIssue[] = [],
  conflictReasons: string[] = []
) => deriveProcessingDisposition({ decision, issues, conflictReasons });

describe("Food Catalog Plan 4 processing disposition", () => {
  it("keeps structural invalidity as canonical REJECT plus disposition REJECT", () => {
    expect(disposition(
      { kind: "reject", issueCodes: ["invalid_source_checksum"] },
      [{ code: "missing_source_id", severity: "error", field: "sourceRecordId" }]
    )).toEqual({ kind: "reject", reasonCodes: ["invalid_source_checksum", "missing_source_id"] });
  });

  it("rejects validation errors even if the provisional canonical decision was CREATE", () => {
    expect(disposition(
      { kind: "create" },
      [{ code: "invalid_nutrition", severity: "error", field: "nutrition" }]
    )).toEqual({ kind: "reject", reasonCodes: ["invalid_nutrition"] });
  });

  it("maps POSSIBLE_DUPLICATE to quarantine without creating a fifth canonical outcome", () => {
    expect(disposition({ kind: "possible_duplicate", candidateFoodIds: ["food-1"] })).toEqual({
      kind: "quarantine",
      reasonCodes: ["possible_duplicate"]
    });
  });

  it("quarantines suspicious nutrition warnings instead of rejecting valid source structure", () => {
    expect(disposition(
      { kind: "create" },
      [{ code: "suspicious_calorie_macro_delta", severity: "warning", field: "nutrition.calories" }]
    )).toEqual({ kind: "quarantine", reasonCodes: ["nutrition_anomaly"] });
  });

  it("can quarantine provisional MATCH/CREATE decisions for explicit conflicts without changing the canonical decision", () => {
    expect(disposition({ kind: "match", foodId: "food-1" }, [], ["barcode_conflict", "evidence_inconsistency", "barcode_conflict"])).toEqual({
      kind: "quarantine",
      reasonCodes: ["barcode_conflict", "evidence_inconsistency"]
    });
  });

  it("accepts valid MATCH/CREATE decisions with no quarantine evidence", () => {
    expect(disposition({ kind: "create" })).toEqual({ kind: "accept", reasonCodes: [] });
    expect(disposition({ kind: "match", foodId: "food-1" })).toEqual({ kind: "accept", reasonCodes: [] });
  });
});
