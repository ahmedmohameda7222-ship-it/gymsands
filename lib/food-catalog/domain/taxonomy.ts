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
