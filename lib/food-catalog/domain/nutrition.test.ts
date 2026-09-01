import { describe, expect, it } from "vitest";
import { validateFoodNutritionRevision } from "./nutrition";

describe("validateFoodNutritionRevision", () => {
  const base = {
    foodId: "food-1",
    revisionNumber: 1,
    calories: 0,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    saturated_fat_g: null,
    fiber_g: null,
    sugars_g: null,
    sodium_mg: null,
    basisAmount: 100,
    basisUnit: "g" as const,
    nutrientMappingVersion: "test-v1",
    sourceRecordId: null,
  };

  it("preserves unknown separately from explicit zero", () => {
    const value = validateFoodNutritionRevision(base);
    expect(value.calories).toBe(0);
    expect(value.protein_g).toBeNull();
  });

  it("rejects negative known nutrients", () => {
    expect(() => validateFoodNutritionRevision({ ...base, protein_g: -0.1 })).toThrow(/non-negative/i);
  });

  it("rejects non-finite nutrients", () => {
    expect(() => validateFoodNutritionRevision({ ...base, calories: Number.NaN })).toThrow(/finite/i);
  });

  it("requires a positive integer revision and positive basis", () => {
    expect(() => validateFoodNutritionRevision({ ...base, revisionNumber: 0 })).toThrow(/revision/i);
    expect(() => validateFoodNutritionRevision({ ...base, revisionNumber: 1.5 })).toThrow(/revision/i);
    expect(() => validateFoodNutritionRevision({ ...base, basisAmount: 0 })).toThrow(/basis/i);
  });

  it("requires a nonblank nutrient mapping version", () => {
    expect(() => validateFoodNutritionRevision({ ...base, nutrientMappingVersion: "  " })).toThrow(/mapping/i);
  });
});
