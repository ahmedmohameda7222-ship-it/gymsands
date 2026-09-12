import { describe, expect, it } from "vitest";
import {
  FOOD_CATALOG_PORTABLE_RELATIONS_V1,
  findPortableRelationRule,
  requiredSegmentsForProfile,
} from "./relation-registry";

describe("Plan 7 relation/load-mode registry", () => {
  it("keeps classification independent from restore load mode", () => {
    expect(findPortableRelationRule("food_items")).toMatchObject({
      classification: "PORTABLE_AUTHORITY",
      loadMode: "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY",
      transientNeutralize: ["verified_source_record_id"],
    });
    expect(findPortableRelationRule("food_catalog_search_documents")).toMatchObject({
      classification: "DERIVED_REBUILD",
      loadMode: "DERIVED_REBUILD",
    });
  });

  it("validates migration-owned seed/singleton state rather than blind upsert", () => {
    for (const relation of [
      "food_taxonomy_namespaces",
      "food_taxonomy_nodes",
      "market_scopes",
      "market_scope_memberships",
      "food_catalog_governance_policy_versions",
      "food_catalog_governance_policy_pointer",
      "food_catalog_current_generation",
      "release_schema_compatibility",
    ]) {
      expect(findPortableRelationRule(relation)?.loadMode).toBe("VALIDATE_PRESEEDED");
      expect(findPortableRelationRule(relation)?.seedOwnership).toBe("MIGRATION_OWNED");
    }
  });

  it("preserves aliases and legacy market relevance as transitional portable state", () => {
    expect(findPortableRelationRule("food_aliases")).toMatchObject({
      classification: "TRANSITIONAL_PORTABLE_COMPATIBILITY",
      loadMode: "RESTORE_EXACT",
    });
    expect(findPortableRelationRule("food_market_relevance")).toMatchObject({
      classification: "TRANSITIONAL_PORTABLE_COMPATIBILITY",
      loadMode: "RESTORE_EXACT",
    });
  });

  it("neutralizes the complete ingestion lease shape while preserving durable fencing history", () => {
    const ingestionRun = findPortableRelationRule("food_ingestion_runs");
    expect(ingestionRun?.loadMode).toBe("RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION");
    expect(ingestionRun?.transientNeutralize).toEqual([
      "lease_owner",
      "lease_token",
      "lease_acquired_at",
      "lease_heartbeat_at",
      "lease_expires_at",
    ]);
    expect(ingestionRun?.transientNeutralize).not.toContain("lease_epoch");

    const outbox = findPortableRelationRule("food_catalog_governance_outbox");
    expect(outbox?.loadMode).toBe("RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION");
    expect(outbox?.transientNeutralize).toEqual(expect.arrayContaining(["lease_token"]));
  });

  it("requires every current protected owner-state family only for FULL_DR", () => {
    for (const relation of [
      "food_catalog_governance_principals",
      "food_catalog_governance_capability_assignments",
      "food_personal_overrides",
      "food_personal_override_revisions",
      "food_personal_override_operations",
      "food_personal_corrections",
      "food_favorites",
    ]) {
      expect(findPortableRelationRule(relation)).toMatchObject({ requiredProfile: "FULL_DR", protected: true });
    }

    for (const relation of ["food_personal_corrections", "food_favorites"]) {
      expect(findPortableRelationRule(relation)).toMatchObject({
        classification: "PROTECTED_PORTABLE_AUTHORITY",
        loadMode: "RESTORE_EXACT",
        stableKey: ["user_id", "food_id"],
      });
      expect(requiredSegmentsForProfile("FULL_DR")).toContain(relation);
      expect(requiredSegmentsForProfile("CORE_PORTABLE")).not.toContain(relation);
    }

    expect(requiredSegmentsForProfile("FULL_DR").length)
      .toBeGreaterThan(requiredSegmentsForProfile("CORE_PORTABLE").length);
  });

  it("has unique logical segment names and stable-key declarations", () => {
    const names = FOOD_CATALOG_PORTABLE_RELATIONS_V1.map((entry) => entry.segment);
    expect(new Set(names).size).toBe(names.length);
    expect(FOOD_CATALOG_PORTABLE_RELATIONS_V1.every((entry) => entry.stableKey.length > 0)).toBe(true);
  });
});
