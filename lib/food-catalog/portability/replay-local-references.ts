export const PLAN7_MIGRATION_SYSTEM_KITCHEN_NAMES_V1 = Object.freeze([
  "Egyptian Kitchen",
] as const);

export const PLAN7_MIGRATION_SYSTEM_SUBCATEGORY_NAMES_V1 = Object.freeze([
  "Bread",
  "Breakfast",
  "Carb",
  "Dairy",
  "Dessert",
  "Dip",
  "Drink",
  "Legumes",
  "Snack",
  "Soup",
  "Stew",
  "Vegetable",
] as const);

const systemKitchenNames = new Set<string>(PLAN7_MIGRATION_SYSTEM_KITCHEN_NAMES_V1);
const systemSubcategoryNames = new Set<string>(PLAN7_MIGRATION_SYSTEM_SUBCATEGORY_NAMES_V1);

/**
 * These names are Git-migration-owned semantic identities whose UUID/timestamps are
 * intentionally replay-local because the original migration uses gen_random_uuid()
 * and now(). Runtime/user rows are not covered by this allowlist and remain exact-ID
 * portable state.
 */
export function isPlan7MigrationSystemKitchenName(value: string): boolean {
  return systemKitchenNames.has(value);
}

export function isPlan7MigrationSystemSubcategoryName(value: string): boolean {
  return systemSubcategoryNames.has(value);
}
