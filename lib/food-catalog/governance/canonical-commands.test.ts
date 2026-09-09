import { describe, expect, it } from "vitest";
import { planCanonicalCorrection } from "./canonical-commands";

const FOOD = "11111111-1111-4111-8111-111111111111";
const CASE = "22222222-2222-4222-8222-222222222222";

describe("Food Catalog Plan 6 named canonical correction commands", () => {
  it("maps nutrition correction to an append-only nutrition revision and preserves unknown nutrients", () => {
    const plan = planCanonicalCorrection({
      commandName: "apply_nutrition_correction",
      category: "wrong_nutrition",
      foodId: FOOD,
      correctionCaseId: CASE,
      caseState: "approved",
      expectedAuthorityId: null,
      payload: { calories: null, protein_g: 12, carbs_g: null, fat_g: 3 },
    });
    expect(plan.authorityKind).toBe("nutrition_revision");
    expect(plan.capability).toBe("food.nutrition.correct");
    expect(plan.payload).toMatchObject({ calories: null, carbs_g: null });
  });

  it("maps every supported global correction to a named authority fact", () => {
    const fixtures = [
      ["apply_serving_correction", "wrong_serving", "serving_option", "food.serving.correct"],
      ["apply_name_correction", "wrong_name", "name_fact", "food.name.correct"],
      ["apply_barcode_correction", "wrong_barcode", "barcode_correction", "food.barcode.correct"],
      ["apply_taxonomy_correction", "wrong_taxonomy", "taxonomy_assignment", "food.taxonomy.correct"],
      ["apply_market_correction", "wrong_market_relevance", "market_assignment", "food.market.correct"],
    ] as const;
    for (const [commandName, category, authorityKind, capability] of fixtures) {
      expect(planCanonicalCorrection({ commandName, category, foodId: FOOD, correctionCaseId: CASE, caseState: "approved", expectedAuthorityId: null, payload: {} }))
        .toMatchObject({ commandName, authorityKind, capability });
    }
  });

  it("rejects generic row updates and category/command mismatches", () => {
    expect(() => planCanonicalCorrection({ commandName: "update_food" as never, category: "wrong_nutrition", foodId: FOOD, correctionCaseId: CASE, caseState: "approved", expectedAuthorityId: null, payload: {} })).toThrow(/named|unsupported/i);
    expect(() => planCanonicalCorrection({ commandName: "apply_nutrition_correction", category: "wrong_name", foodId: FOOD, correctionCaseId: CASE, caseState: "approved", expectedAuthorityId: null, payload: {} })).toThrow(/category/i);
  });

  it("requires an approved correction case and explicit current-authority CAS state", () => {
    expect(() => planCanonicalCorrection({ commandName: "apply_name_correction", category: "wrong_name", foodId: FOOD, correctionCaseId: CASE, caseState: "under_review", expectedAuthorityId: null, payload: {} })).toThrow(/approved/i);
    expect(planCanonicalCorrection({ commandName: "apply_name_correction", category: "wrong_name", foodId: FOOD, correctionCaseId: CASE, caseState: "approved", expectedAuthorityId: "33333333-3333-4333-8333-333333333333", payload: { text: "Apple" } }).expectedAuthorityId)
      .toBe("33333333-3333-4333-8333-333333333333");
  });
});
