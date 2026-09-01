import { describe, expect, it } from "vitest";
import {
  PRIMARY_FOOD_GROUP_CODES,
  validateFoodTaxonomyAssignment,
  type FoodTaxonomyAssignmentAction,
  type FoodTaxonomyNamespaceCode,
} from "./taxonomy";

describe("Food taxonomy contracts", () => {
  it("exposes exactly the approved initial primary food-group codes", () => {
    expect(PRIMARY_FOOD_GROUP_CODES).toEqual([
      "protein_foods",
      "dairy",
      "grains",
      "vegetables",
      "fruits",
      "legumes",
      "nuts_seeds",
      "fats_oils",
      "beverages",
      "mixed_dishes",
      "snacks",
      "desserts",
      "condiments",
      "other",
    ]);
  });

  it("keeps namespace and assignment-action contracts controlled", () => {
    const namespace: FoodTaxonomyNamespaceCode = "cuisine";
    const action: FoodTaxonomyAssignmentAction = "remove";
    expect(namespace).toBe("cuisine");
    expect(action).toBe("remove");
  });

  it("rejects invalid taxonomy append values at runtime", () => {
    const valid = {
      foodId: "food-1",
      nodeCode: "primary_food_group:protein_foods",
      sourceRecordId: null,
      action: "assign" as const,
      policyVersion: "taxonomy-v1",
    };

    expect(() => validateFoodTaxonomyAssignment({ ...valid, foodId: " " })).toThrow(/food id/i);
    expect(() => validateFoodTaxonomyAssignment({ ...valid, nodeCode: " " })).toThrow(/node code/i);
    expect(() => validateFoodTaxonomyAssignment({ ...valid, action: "invalid" as never })).toThrow(/action/i);
    expect(() => validateFoodTaxonomyAssignment({ ...valid, policyVersion: " " })).toThrow(/policy version/i);
    expect(validateFoodTaxonomyAssignment(valid)).toEqual(valid);
  });
});
