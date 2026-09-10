import { describe, expect, it } from "vitest";
import { buildFoodCatalogRestorePlan } from "./restore-plan";
import type { PortableRelationSpec } from "./relation-registry";

const spec = (
  relation: string,
  loadMode: PortableRelationSpec["loadMode"],
  overrides: Partial<PortableRelationSpec> = {},
): PortableRelationSpec => ({
  segment: relation,
  relation,
  classification: loadMode === "DERIVED_REBUILD" ? "DERIVED_REBUILD" : "PORTABLE_AUTHORITY",
  loadMode,
  stableKey: ["id"],
  requiredProfile: "CORE_PORTABLE",
  protected: false,
  seedOwnership: "NONE",
  transientNeutralize: [],
  ...overrides,
});

describe("Plan 7 disposable restore plan", () => {
  it("keeps preseed validation separate, resolves the food/source FK cycle, and restores pointer fields last", () => {
    const plan = buildFoodCatalogRestorePlan([
      spec("food_taxonomy_namespaces", "VALIDATE_PRESEEDED", { stableKey: ["namespace_code"], seedOwnership: "MIGRATION_SEEDED" }),
      spec("food_catalog_current_generation", "VALIDATE_PRESEEDED", { stableKey: ["singleton_key"], seedOwnership: "MIGRATION_SEEDED", restoreLast: true }),
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
    expect(plan.find((step) => step.kind === "RESTORE_TRANSITIONAL_WITH_CYCLE_NULL")).toMatchObject({
      relation: "food_items",
      neutralizedColumns: ["verified_source_record_id"],
    });
    expect(plan.find((step) => step.kind === "RECONSTRUCT_TRANSITIONAL_CYCLE_FIELD")).toMatchObject({
      relation: "food_items",
      columns: ["verified_source_record_id"],
      afterRelations: ["food_source_records"],
    });
  });

  it("never treats DERIVED_REBUILD as portable truth and never blindly restores migration-seeded rows", () => {
    const plan = buildFoodCatalogRestorePlan([
      spec("release_schema_compatibility", "VALIDATE_PRESEEDED", { stableKey: ["singleton"], seedOwnership: "MIGRATION_SEEDED" }),
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
