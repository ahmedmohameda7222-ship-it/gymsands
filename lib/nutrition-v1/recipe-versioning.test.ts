import { describe, expect, it } from "vitest";

import {
  evaluateRecipeDraftReadiness,
  nextRecipeVersionNumber,
} from "@/lib/nutrition-v1/recipe-versioning";

describe("Nutrition V1 Recipe versioning", () => {
  it("keeps incomplete Working Drafts saveable but not publishable", () => {
    expect(
      evaluateRecipeDraftReadiness({
        name: "Chicken bowl",
        servings: null,
        ingredients: [],
        instructions: [],
      }),
    ).toEqual({
      ready: false,
      missing: ["servings", "ingredient", "instruction"],
    });
  });

  it("requires exactly the minimum Ready contract and nothing more", () => {
    expect(
      evaluateRecipeDraftReadiness({
        name: "Chicken bowl",
        servings: 4,
        ingredients: [{ ingredient_name: "Chicken", quantity: 500, unit: "g" }],
        instructions: [{ instruction: "Cook using the confirmed recipe instructions." }],
      }),
    ).toEqual({ ready: true, missing: [] });
  });

  it("advances v1 to v2 without mutating published version history", () => {
    const published = Object.freeze([{ version_number: 1, name: "Chicken bowl v1" }]);
    const before = structuredClone(published);

    expect(nextRecipeVersionNumber(published)).toBe(2);
    expect(published).toEqual(before);
  });
});
