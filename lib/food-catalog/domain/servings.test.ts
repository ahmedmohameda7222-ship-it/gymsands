import { describe, expect, it } from "vitest";
import { validateFoodServingOption, type FoodServingOption } from "./servings";

describe("validateFoodServingOption", () => {
  const base: FoodServingOption = {
    foodId: "food-1",
    label: "100 g",
    amount: 100,
    unitCode: "g",
    gramWeight: null,
    sourceRecordId: null,
    sourcePortionCode: null,
    evidenceClass: "exact_source",
    sourcePrimary: false,
  };

  it("allows gram servings without a separate gram weight", () => {
    expect(validateFoodServingOption(base).gramWeight).toBeNull();
  });

  it("requires gram weight for household units", () => {
    expect(() => validateFoodServingOption({ ...base, unitCode: "cup", amount: 1 })).toThrow(/gram weight/i);
  });

  it("rejects non-positive gram weight", () => {
    expect(() => validateFoodServingOption({ ...base, gramWeight: 0 })).toThrow(/gram weight/i);
  });

  it("accepts only approved evidence classes", () => {
    const invalid = { ...base, evidenceClass: "estimated" } as unknown as FoodServingOption;
    expect(() => validateFoodServingOption(invalid)).toThrow(/evidence/i);
  });
});
