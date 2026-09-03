import { describe, expect, it } from "vitest";
import {
  validateGenerationFoodSelection,
  validateGenerationRedirectSelection,
  validateGenerationValidationFinding,
  type GenerationFoodSelection,
} from "./generations";

const FOOD_A = "10000000-0000-4000-8000-000000000001";
const FOOD_B = "10000000-0000-4000-8000-000000000002";
const ACTIVATION_SET = "20000000-0000-4000-8000-000000000001";
const ACTIVATION_MEMBER = "30000000-0000-4000-8000-000000000001";
const ACTIVATION_GRANT = "40000000-0000-4000-8000-000000000001";

function activeSelection(overrides: Partial<GenerationFoodSelection> = {}): GenerationFoodSelection {
  return {
    foodId: FOOD_A,
    lifecycle: "active",
    nutritionRevisionId: null,
    activationSetId: ACTIVATION_SET,
    activationSetMemberId: ACTIVATION_MEMBER,
    activationGrantEventId: ACTIVATION_GRANT,
    ...overrides,
  };
}

describe("Plan 3 generation contracts", () => {
  it("requires exact activation authority for active generation Foods", () => {
    expect(() =>
      validateGenerationFoodSelection(
        activeSelection({
          activationSetId: null,
          activationSetMemberId: null,
          activationGrantEventId: null,
        }),
      ),
    ).toThrow(/activation/i);
  });

  it("rejects activation references for non-active generation Foods", () => {
    expect(() =>
      validateGenerationFoodSelection(activeSelection({ lifecycle: "deprecated" })),
    ).toThrow(/activation/i);
  });

  it("rejects draft and merged lifecycle values at runtime", () => {
    expect(() =>
      validateGenerationFoodSelection(activeSelection({ lifecycle: "draft" as never })),
    ).toThrow(/lifecycle/i);
    expect(() =>
      validateGenerationFoodSelection(activeSelection({ lifecycle: "merged" as never })),
    ).toThrow(/lifecycle/i);
  });

  it("rejects self redirects and blank redirect IDs", () => {
    expect(() =>
      validateGenerationRedirectSelection({ sourceFoodId: FOOD_A, targetFoodId: FOOD_A }),
    ).toThrow(/self/i);
    expect(() =>
      validateGenerationRedirectSelection({ sourceFoodId: " ", targetFoodId: FOOD_B }),
    ).toThrow(/source/i);
  });

  it("rejects runtime-invalid finding severity and blank policy fields", () => {
    const finding = {
      reasonCode: "SELECTED_FACT_MISSING",
      foodId: FOOD_A,
      severity: "error" as const,
      blocking: true,
      evidenceReference: "nutrition:missing",
      validatorPolicyVersion: "generation-validator-v1",
      details: { selectedFactType: "nutrition" },
    };

    expect(validateGenerationValidationFinding(finding)).toEqual(finding);
    expect(() =>
      validateGenerationValidationFinding({ ...finding, severity: "fatal" as never }),
    ).toThrow(/severity/i);
    expect(() =>
      validateGenerationValidationFinding({ ...finding, reasonCode: " " }),
    ).toThrow(/reason code/i);
    expect(() =>
      validateGenerationValidationFinding({ ...finding, validatorPolicyVersion: " " }),
    ).toThrow(/policy/i);
  });

  it("rejects blank Food and selected-fact IDs", () => {
    expect(() => validateGenerationFoodSelection(activeSelection({ foodId: " " }))).toThrow(/food id/i);
    expect(() =>
      validateGenerationFoodSelection(activeSelection({ nutritionRevisionId: " " })),
    ).toThrow(/nutrition/i);
  });
});
