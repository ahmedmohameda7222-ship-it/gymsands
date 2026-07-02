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

  it("flags an extremely low planned day", () => {
    expect(validateMealPlanDay([{ calories: 250 }, { calories: 300 }])?.label).toBe("Very low calories");
  });

  it("flags a day far from an explicit target", () => {
    expect(validateMealPlanDay([{ calories: 1000 }, { calories: 900 }], 3000)?.label).toBe("Far from target");
  });
});
