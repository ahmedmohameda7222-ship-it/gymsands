import type { PortableRelationRule } from "./relation-registry";

export type FoodCatalogRestoreStep = Readonly<{
  kind:
    | "VERIFY_TARGET_PROFILE"
    | "VALIDATE_PRESEEDED"
    | "VALIDATE_POINTER_SINGLETON_IDENTITY"
    | "RESTORE_TRANSITIONAL_WITH_CYCLE_NULL"
    | "RESTORE_EXACT"
    | "RECONSTRUCT_TRANSITIONAL_CYCLE_FIELD"
    | "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION"
    | "MARK_DERIVED_REBUILD_PENDING"
    | "PRE_POINTER_VERIFY"
    | "RESTORE_POINTER_FIELDS_LAST"
    | "MARK_RESTORE_UNTRUSTED_PENDING_ASSERTIONS";
  relation?: string;
  segment?: string;
  stableKey?: readonly string[];
  neutralizedColumns?: readonly string[];
  columns?: readonly string[];
  afterRelations?: readonly string[];
}>;

function step(kind: FoodCatalogRestoreStep["kind"], rule?: PortableRelationRule, extras: Partial<FoodCatalogRestoreStep> = {}): FoodCatalogRestoreStep {
  return Object.freeze({
    kind,
    ...(rule ? { relation: rule.relation, segment: rule.segment, stableKey: Object.freeze([...rule.stableKey]) } : {}),
    ...extras,
  });
}

export function buildFoodCatalogRestorePlan(rules: readonly PortableRelationRule[]): readonly FoodCatalogRestoreStep[] {
  const names = new Set<string>();
  for (const rule of rules) {
    if (names.has(rule.segment)) throw new Error(`Duplicate Plan 7 restore segment ${rule.segment}.`);
    names.add(rule.segment);
    if (!rule.stableKey.length) throw new Error(`Stable restore key is required for ${rule.relation}.`);
  }

  const foodItems = rules.find((rule) => rule.relation === "food_items");
  if (foodItems?.loadMode === "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY") {
    const neutralized = [...(foodItems.transientNeutralize ?? [])];
    if (neutralized.length !== 1 || neutralized[0] !== "verified_source_record_id") {
      throw new Error("food_items FK-cycle restore may neutralize only verified_source_record_id.");
    }
    const source = rules.find((rule) => rule.relation === "food_source_records");
    if (!source || source.loadMode !== "RESTORE_EXACT") {
      throw new Error("food_items FK-cycle restore requires exact food_source_records authority.");
    }
  }

  const result: FoodCatalogRestoreStep[] = [step("VERIFY_TARGET_PROFILE")];

  for (const rule of rules) {
    if (rule.loadMode === "VALIDATE_PRESEEDED" && !rule.restoreLast) {
      result.push(step("VALIDATE_PRESEEDED", rule));
    }
  }
  for (const rule of rules) {
    if (rule.loadMode === "VALIDATE_PRESEEDED" && rule.restoreLast) {
      result.push(step("VALIDATE_POINTER_SINGLETON_IDENTITY", rule));
    }
  }

  if (foodItems?.loadMode === "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY") {
    result.push(step("RESTORE_TRANSITIONAL_WITH_CYCLE_NULL", foodItems, {
      neutralizedColumns: Object.freeze(["verified_source_record_id"]),
    }));
  }

  const sourceRecordRule = rules.find((rule) => rule.relation === "food_source_records" && rule.loadMode === "RESTORE_EXACT");
  if (sourceRecordRule) result.push(step("RESTORE_EXACT", sourceRecordRule));

  if (foodItems?.loadMode === "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY") {
    result.push(step("RECONSTRUCT_TRANSITIONAL_CYCLE_FIELD", foodItems, {
      columns: Object.freeze(["verified_source_record_id"]),
      afterRelations: Object.freeze(["food_source_records"]),
    }));
  }

  for (const rule of rules) {
    if (rule === sourceRecordRule || rule === foodItems) continue;
    if (rule.loadMode === "RESTORE_EXACT") result.push(step("RESTORE_EXACT", rule));
  }
  for (const rule of rules) {
    if (rule.loadMode === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {
      result.push(step("RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION", rule, {
        neutralizedColumns: Object.freeze([...(rule.transientNeutralize ?? [])]),
      }));
    }
  }
  for (const rule of rules) {
    if (rule.loadMode === "DERIVED_REBUILD") result.push(step("MARK_DERIVED_REBUILD_PENDING", rule));
  }

  const pointerRules = rules.filter((rule) => rule.loadMode === "VALIDATE_PRESEEDED" && rule.restoreLast);
  if (pointerRules.length) result.push(step("PRE_POINTER_VERIFY"));
  for (const rule of pointerRules) result.push(step("RESTORE_POINTER_FIELDS_LAST", rule));
  result.push(step("MARK_RESTORE_UNTRUSTED_PENDING_ASSERTIONS"));
  return Object.freeze(result);
}
