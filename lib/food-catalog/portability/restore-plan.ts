import type { PortableRelationRule } from "./relation-registry";
import { sortRestoreRulesByDependencies } from "./restore-dependencies";

export type FoodCatalogRestoreStep = Readonly<{
  kind:
    | "VERIFY_TARGET_PROFILE"
    | "VALIDATE_PRESEEDED"
    | "RESTORE_MIXED_KEYED_PRESEEDED_RUNTIME"
    | "VALIDATE_POINTER_SINGLETON_IDENTITY"
    | "RESTORE_MUTABLE_SINGLETON_FIELDS"
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

  // Migration-created seed identities are established by exact Git schema replay.
  // Mixed relations restore only source-only runtime keys; mutable singleton fields
  // are keyed updates after singleton identity validation.
  for (const rule of rules) {
    if (rule.loadMode !== "VALIDATE_PRESEEDED" || rule.restoreLast) continue;
    if (rule.restoreOwnership === "MIXED_KEYED_PRESEEDED_RUNTIME") {
      result.push(step("RESTORE_MIXED_KEYED_PRESEEDED_RUNTIME", rule));
    } else if (rule.restoreOwnership === "MUTABLE_PRESEEDED_SINGLETON") {
      result.push(step("VALIDATE_POINTER_SINGLETON_IDENTITY", rule));
      result.push(step("RESTORE_MUTABLE_SINGLETON_FIELDS", rule));
    } else {
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

  // Exact and transient-neutralized relations participate in one dependency graph.
  // This prevents, for example, generation/activation events from being replayed
  // before their food_catalog_control_operations FK authority, and prevents
  // ingestion control history from preceding the run it references.
  const dataRules = rules.filter((rule) =>
    rule !== sourceRecordRule
    && rule !== foodItems
    && (rule.loadMode === "RESTORE_EXACT" || rule.loadMode === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION"),
  );
  const satisfiedBeforeData = [
    ...rules.filter((rule) => rule.loadMode === "VALIDATE_PRESEEDED" && !rule.restoreLast).map((rule) => rule.relation),
    ...(foodItems ? [foodItems.relation] : []),
    ...(sourceRecordRule ? [sourceRecordRule.relation] : []),
  ];
  for (const rule of sortRestoreRulesByDependencies(dataRules, satisfiedBeforeData)) {
    if (rule.loadMode === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {
      result.push(step("RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION", rule, {
        neutralizedColumns: Object.freeze([...(rule.transientNeutralize ?? [])]),
      }));
    } else {
      result.push(step("RESTORE_EXACT", rule));
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
