export type SeedRuntimeOwnershipPolicy = Readonly<{
  relation: string;
  migrationSeedKeys: readonly (readonly string[])[];
  preseedComparisonOmit: readonly string[];
}>;

function policy(
  relation: string,
  migrationSeedKeys: readonly (readonly string[])[],
  preseedComparisonOmit: readonly string[] = [],
): SeedRuntimeOwnershipPolicy {
  return Object.freeze({
    relation,
    migrationSeedKeys: Object.freeze(migrationSeedKeys.map((key) => Object.freeze([...key]))),
    preseedComparisonOmit: Object.freeze([...preseedComparisonOmit]),
  });
}

/**
 * These are immutable identities created by exact repository migrations.
 * Relations may later contain additional runtime-created keys; only the keys
 * listed here remain migration-owned. created_at is omitted only where the
 * migration deliberately used DEFAULT now(), because replay time is not product
 * authority and differs across two exact Git migration replays.
 */
export const FOOD_CATALOG_SEED_RUNTIME_OWNERSHIP_V1: readonly SeedRuntimeOwnershipPolicy[] = Object.freeze([
  policy("food_taxonomy_namespaces", [
    ["primary_food_group"], ["ingredient_family"], ["preparation"],
    ["physical_state"], ["form_cut"], ["cuisine"],
  ], ["created_at"]),
  policy("food_taxonomy_nodes", [
    ["protein_foods"], ["dairy"], ["grains"], ["vegetables"], ["fruits"],
    ["legumes"], ["nuts_seeds"], ["fats_oils"], ["beverages"],
    ["mixed_dishes"], ["snacks"], ["desserts"], ["condiments"], ["other"],
  ], ["created_at"]),
  policy("market_scopes", [
    ["GLOBAL"], ["US"], ["DE"], ["EG"], ["GB"], ["SA"], ["AE"], ["EU"], ["GCC"],
  ], ["created_at"]),
  policy("market_scope_memberships", [
    ["DE", "EU"], ["SA", "GCC"], ["AE", "GCC"],
  ], ["created_at"]),
  policy("food_catalog_governance_policy_versions", [["plan6-v1"]], ["created_at"]),
  policy("food_catalog_governance_policy_pointer", [["true"]]),
  policy("food_catalog_current_generation", [["true"]]),
  policy("release_schema_compatibility", [["true"]]),
]);

const BY_RELATION = new Map(FOOD_CATALOG_SEED_RUNTIME_OWNERSHIP_V1.map((entry) => [entry.relation, entry]));

export function seedRuntimeOwnershipForRelation(relation: string): SeedRuntimeOwnershipPolicy | undefined {
  return BY_RELATION.get(relation);
}

export function stableKeyTextTuple(
  row: Readonly<Record<string, Readonly<{ text: string | null }>>>,
  stableKey: readonly string[],
): readonly string[] {
  return Object.freeze(stableKey.map((column) => {
    const scalar = row[column];
    if (!scalar || scalar.text === null) throw new Error(`Stable ownership key ${column} must be present and non-null.`);
    return scalar.text;
  }));
}

export function isMigrationSeedKey(
  policy: SeedRuntimeOwnershipPolicy,
  key: readonly string[],
): boolean {
  return policy.migrationSeedKeys.some((seed) => seed.length === key.length && seed.every((value, index) => value === key[index]));
}
