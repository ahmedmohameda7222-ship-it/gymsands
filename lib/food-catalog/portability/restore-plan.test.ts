import { describe, expect, it } from "vitest";
import { buildFoodCatalogRestorePlan } from "./restore-plan";
import type { PortableRelationRule } from "./relation-registry";

const spec = (
  relation: string,
  loadMode: PortableRelationRule["loadMode"],
  overrides: Partial<PortableRelationRule> = {},
): PortableRelationRule => ({
  segment: relation,
  relation,
  classification: loadMode === "DERIVED_REBUILD" ? "DERIVED_REBUILD" : "PORTABLE_AUTHORITY",
  loadMode,
  stableKey: ["id"],
  requiredProfile: "CORE_PORTABLE",
  protected: false,
  seedOwnership: "NONE",
  restoreOwnership: "UNIFORM",
  transientNeutralize: [],
  ...overrides,
});

describe("Plan 7 disposable restore plan", () => {
  it("keeps preseed validation separate, resolves the food/source FK cycle, and restores pointer fields last", () => {
    const plan = buildFoodCatalogRestorePlan([
      spec("food_taxonomy_namespaces", "VALIDATE_PRESEEDED", { stableKey: ["namespace_code"], seedOwnership: "MIGRATION_OWNED" }),
      spec("food_catalog_current_generation", "VALIDATE_PRESEEDED", { stableKey: ["singleton_key"], seedOwnership: "MIGRATION_OWNED", restoreOwnership: "MUTABLE_PRESEEDED_SINGLETON", restoreLast: true }),
      spec("food_items", "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY", { transientNeutralize: ["verified_source_record_id"] }),
      spec("food_source_records", "RESTORE_EXACT"),
      spec("food_ingestion_runs", "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION", { transientNeutralize: ["lease_owner", "lease_expires_at"] }),
      spec("food_catalog_search_documents", "DERIVED_REBUILD"),
    ]);

    expect(plan.map((step) => step.kind)).toEqual([
      "VERIFY_TARGET_PROFILE",
      "VALIDATE_PRESEEDED",
      "VALIDATE_POINTER_SINGLETON_IDENTITY",
      "RESTORE_TRANSITIONAL_WITH_CYCLE_NULL",
      "RESTORE_EXACT",
      "RECONSTRUCT_TRANSITIONAL_CYCLE_FIELD",
      "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION",
      "MARK_DERIVED_REBUILD_PENDING",
      "PRE_POINTER_VERIFY",
      "RESTORE_POINTER_FIELDS_LAST",
      "MARK_RESTORE_UNTRUSTED_PENDING_ASSERTIONS",
    ]);
  });

  it("restores source-only runtime rows in mixed migration-seed relations while validating conflicts exactly", () => {
    const plan = buildFoodCatalogRestorePlan([
      spec("food_taxonomy_nodes", "VALIDATE_PRESEEDED", {
        stableKey: ["node_code"],
        seedOwnership: "MIGRATION_OWNED",
        restoreOwnership: "MIXED_KEYED_PRESEEDED_RUNTIME",
      }),
      spec("market_scopes", "VALIDATE_PRESEEDED", {
        stableKey: ["scope_code"],
        seedOwnership: "MIGRATION_OWNED",
        restoreOwnership: "MIXED_KEYED_PRESEEDED_RUNTIME",
      }),
      spec("food_catalog_governance_policy_pointer", "VALIDATE_PRESEEDED", {
        stableKey: ["singleton"],
        seedOwnership: "MIGRATION_OWNED",
        restoreOwnership: "MUTABLE_PRESEEDED_SINGLETON",
      }),
    ]);
    expect(plan.map((step) => [step.kind, step.relation])).toEqual([
      ["VERIFY_TARGET_PROFILE", undefined],
      ["RESTORE_MIXED_KEYED_PRESEEDED_RUNTIME", "food_taxonomy_nodes"],
      ["RESTORE_MIXED_KEYED_PRESEEDED_RUNTIME", "market_scopes"],
      ["VALIDATE_POINTER_SINGLETON_IDENTITY", "food_catalog_governance_policy_pointer"],
      ["RESTORE_MUTABLE_SINGLETON_FIELDS", "food_catalog_governance_policy_pointer"],
      ["MARK_RESTORE_UNTRUSTED_PENDING_ASSERTIONS", undefined],
    ]);
  });

  it("topologically reorders populated FK authority instead of trusting registry declaration order", () => {
    const plan = buildFoodCatalogRestorePlan([
      spec("food_catalog_activation_events", "RESTORE_EXACT"),
      spec("food_catalog_generation_events", "RESTORE_EXACT"),
      spec("food_catalog_generation_validation_reports", "RESTORE_EXACT"),
      spec("food_catalog_generations", "RESTORE_EXACT"),
      spec("food_catalog_activation_sets", "RESTORE_EXACT"),
      spec("food_catalog_control_operations", "RESTORE_EXACT"),
      spec("food_ingestion_control_operations", "RESTORE_EXACT"),
      spec("food_ingestion_runs", "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION", { transientNeutralize: ["lease_owner"] }),
      spec("food_ingestion_batches", "RESTORE_EXACT"),
    ]);
    const ordered = plan.filter((entry) => entry.relation).map((entry) => entry.relation);
    expect(ordered.indexOf("food_catalog_control_operations")).toBeLessThan(ordered.indexOf("food_catalog_activation_events"));
    expect(ordered.indexOf("food_catalog_control_operations")).toBeLessThan(ordered.indexOf("food_catalog_generation_events"));
    expect(ordered.indexOf("food_catalog_generations")).toBeLessThan(ordered.indexOf("food_catalog_generation_validation_reports"));
    expect(ordered.indexOf("food_catalog_generation_validation_reports")).toBeLessThan(ordered.indexOf("food_catalog_generation_events"));
    expect(ordered.indexOf("food_ingestion_batches")).toBeLessThan(ordered.indexOf("food_ingestion_runs"));
    expect(ordered.indexOf("food_ingestion_runs")).toBeLessThan(ordered.indexOf("food_ingestion_control_operations"));
  });

  it("never treats DERIVED_REBUILD as portable truth and never blindly restores uniform migration-seeded rows", () => {
    const plan = buildFoodCatalogRestorePlan([
      spec("release_schema_compatibility", "VALIDATE_PRESEEDED", { stableKey: ["singleton"], seedOwnership: "MIGRATION_OWNED" }),
      spec("food_catalog_search_documents", "DERIVED_REBUILD"),
    ]);
    expect(plan.some((step) => step.kind.startsWith("RESTORE") && step.relation === "release_schema_compatibility")).toBe(false);
    expect(plan.some((step) => step.kind.startsWith("RESTORE") && step.relation === "food_catalog_search_documents")).toBe(false);
  });

  it("fails closed when transitional food_items is missing the only approved cycle-neutralized field", () => {
    expect(() => buildFoodCatalogRestorePlan([
      spec("food_items", "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY", { transientNeutralize: [] }),
      spec("food_source_records", "RESTORE_EXACT"),
    ])).toThrow(/verified_source_record_id|cycle/i);
  });
});
