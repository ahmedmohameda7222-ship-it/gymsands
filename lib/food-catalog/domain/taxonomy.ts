export type FoodTaxonomyNamespaceCode =
  | "primary_food_group"
  | "ingredient_family"
  | "preparation"
  | "physical_state"
  | "form_cut"
  | "cuisine";

export type FoodTaxonomyAssignmentAction = "assign" | "remove";

export const PRIMARY_FOOD_GROUP_CODES = [
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
] as const;

export type PrimaryFoodGroupCode = (typeof PRIMARY_FOOD_GROUP_CODES)[number];

export type FoodTaxonomyAssignment = {
  foodId: string;
  nodeCode: string;
  sourceRecordId: string | null;
  action: FoodTaxonomyAssignmentAction;
  policyVersion: string;
};

export function validateFoodTaxonomyAssignment(value: FoodTaxonomyAssignment): FoodTaxonomyAssignment {
  if (!value.foodId.trim()) throw new Error("Food taxonomy assignment food ID must be nonblank.");
  if (!value.nodeCode.trim()) throw new Error("Food taxonomy assignment node code must be nonblank.");
  if (value.action !== "assign" && value.action !== "remove") {
    throw new Error("Food taxonomy assignment action is invalid.");
  }
  if (!value.policyVersion.trim()) {
    throw new Error("Food taxonomy assignment policy version must be nonblank.");
  }
  return value;
}
