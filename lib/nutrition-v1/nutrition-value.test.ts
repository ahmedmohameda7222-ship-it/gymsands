import { describe, expect, it } from "vitest";

import {
  hasCompleteNutrition,
  scaleNutritionFacts,
  sumNutritionFacts,
} from "./nutrition-value";

describe("Nutrition V1 nullable nutrition math", () => {
  it("keeps an unresolved nutrient unknown while summing known nutrients", () => {
    expect(
      sumNutritionFacts([
        { calories: 100, protein_g: 10, carbs_g: 20, fat_g: 3, fiber_g: 2 },
        { calories: null, protein_g: 5, carbs_g: 10, fat_g: null, fiber_g: 1 },
      ]),
    ).toEqual({
      calories: null,
      protein_g: 15,
      carbs_g: 30,
      fat_g: null,
      fiber_g: 3,
    });
  });

  it("preserves unknown nutrients when scaling a serving", () => {
    expect(
      scaleNutritionFacts(
        { calories: 320, protein_g: null, carbs_g: 40, fat_g: 12, fiber_g: null },
        0.5,
      ),
    ).toEqual({
      calories: 160,
      protein_g: null,
      carbs_g: 20,
      fat_g: 6,
      fiber_g: null,
    });
  });

  it("rejects invalid scale factors instead of manufacturing values", () => {
    expect(() =>
      scaleNutritionFacts(
        { calories: 100, protein_g: 10, carbs_g: 10, fat_g: 4, fiber_g: 1 },
        -1,
      ),
    ).toThrow(/scale/i);
  });

  it("reports completeness only when all required macros are known", () => {
    expect(
      hasCompleteNutrition({ calories: 500, protein_g: 30, carbs_g: 50, fat_g: 20, fiber_g: null }),
    ).toBe(true);

    expect(
      hasCompleteNutrition({ calories: 500, protein_g: null, carbs_g: 50, fat_g: 20, fiber_g: 5 }),
    ).toBe(false);
  });
});
