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

  it("allows direct gram servings without a separate gram weight or source record", () => {
    expect(validateFoodServingOption(base)).toMatchObject({
      unitCode: "g",
      gramWeight: null,
      sourceRecordId: null,
    });
  });

  it("requires gram weight for household units", () => {
    expect(() => validateFoodServingOption({ ...base, unitCode: "cup", amount: 1 })).toThrow(/gram weight/i);
  });

  it("rejects household conversions with a positive gram weight but no source-backed provenance", () => {
    expect(() => validateFoodServingOption({
      ...base,
      label: "1 cup",
      amount: 1,
      unitCode: "cup",
      gramWeight: 240,
      sourceRecordId: null,
    })).toThrow(/source|evidence|provenance/i);
  });

  it("accepts source-backed household conversions", () => {
    const value = validateFoodServingOption({
      ...base,
      label: "1 cup",
      amount: 1,
      unitCode: "cup",
      gramWeight: 240,
      sourceRecordId: "source-1",
      sourcePortionCode: "cup",
    });
    expect(value).toMatchObject({
      unitCode: "cup",
      gramWeight: 240,
      sourceRecordId: "source-1",
    });
  });

  it("rejects non-positive gram weight", () => {
    expect(() => validateFoodServingOption({ ...base, gramWeight: 0 })).toThrow(/gram weight/i);
  });

  it("accepts only approved evidence classes", () => {
    const invalid = { ...base, evidenceClass: "estimated" } as unknown as FoodServingOption;
    expect(() => validateFoodServingOption(invalid)).toThrow(/evidence/i);
  });
});
