import { describe, expect, it } from "vitest";
import { validateMealItem, validateMealPlanDay } from "./meal-validation";

describe("meal plan validation", () => {
  it("accepts reasonably aligned calories and macros", () => {
    expect(validateMealItem({ calories: 500, protein_g: 35, carbs_g: 55, fat_g: 15, quantity: 1 }).label).toBe("Looks valid");
  });

  it("flags missing macros without changing values", () => {
    expect(validateMealItem({ calories: 400, protein_g: 0, carbs_g: 0, fat_g: 0, quantity: 1 }).label).toBe("Missing macros");
  });

  it("flags suspicious macro energy", () => {
    expect(validateMealItem({ calories: 200, protein_g: 60, carbs_g: 80, fat_g: 30, quantity: 1 }).label).toBe("Needs review");
  });

  it("treats unknown item calories as unavailable rather than numeric zero", () => {
    const result = validateMealItem({ calories: null, protein_g: 20, carbs_g: 30, fat_g: 10, quantity: 1 });
    expect(result.label).toBe("Needs review");
    expect(result.detail).not.toMatch(/0 kcal/);
  });

  it("does not compare macro energy when any macro is unknown", () => {
    const result = validateMealItem({ calories: 400, protein_g: null, carbs_g: 50, fat_g: 10, quantity: 1 });
    expect(result.label).toBe("Missing macros");
    expect(result.detail).toBe("Add protein, carbs, and fat before relying on this meal.");
  });

  it("flags an extremely low planned day", () => {
    expect(validateMealPlanDay([{ calories: 250 }, { calories: 300 }])?.label).toBe("Very low calories");
  });

  it("flags a day far from an explicit target", () => {
    expect(validateMealPlanDay([{ calories: 1000 }, { calories: 900 }], 3000)?.label).toBe("Far from target");
  });

  it("does not issue numeric whole-day judgments from an incomplete calorie total", () => {
    const result = validateMealPlanDay([{ calories: 250 }, { calories: null }], 3000);
    expect(result?.label).toBe("Needs review");
    expect(result?.label).not.toBe("Very low calories");
    expect(result?.label).not.toBe("Far from target");
    expect(result?.detail).not.toMatch(/\d+ kcal/);
  });

  it("keeps fully known whole-day behavior unchanged", () => {
    expect(validateMealPlanDay([{ calories: 250 }, { calories: 300 }])?.label).toBe("Very low calories");
    expect(validateMealPlanDay([{ calories: 1000 }, { calories: 900 }], 3000)?.label).toBe("Far from target");
  });

  it("keeps fully known item validation unchanged", () => {
    expect(validateMealItem({ calories: 500, protein_g: 35, carbs_g: 55, fat_g: 15, quantity: 1 })).toEqual({
      label: "Looks valid",
      tone: "success",
      detail: "Saved calories and macro energy are reasonably aligned.",
    });
  });
});