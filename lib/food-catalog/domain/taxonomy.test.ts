import { describe, expect, it } from "vitest";
import { PRIMARY_FOOD_GROUP_CODES, type FoodTaxonomyAssignmentAction, type FoodTaxonomyNamespaceCode } from "./taxonomy";

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
});
