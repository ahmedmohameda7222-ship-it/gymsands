import { describe, expect, it } from "vitest";
import {
  isMigrationSeedKey,
  seedRuntimeOwnershipForRelation,
  stableKeyTextTuple,
} from "./seed-runtime-ownership";

describe("Plan 7 mixed seed/runtime ownership", () => {
  it("recognizes exact migration-created taxonomy and market keys", () => {
    const taxonomy = seedRuntimeOwnershipForRelation("food_taxonomy_nodes")!;
    expect(isMigrationSeedKey(taxonomy, ["protein_foods"])).toBe(true);
    expect(isMigrationSeedKey(taxonomy, ["plan7_runtime_node"])).toBe(false);

    const memberships = seedRuntimeOwnershipForRelation("market_scope_memberships")!;
    expect(isMigrationSeedKey(memberships, ["DE", "EU"])).toBe(true);
    expect(isMigrationSeedKey(memberships, ["PLAN7_DE", "EU"])).toBe(false);
  });

  it("treats only plan6-v1 as migration-owned governance policy version", () => {
    const policy = seedRuntimeOwnershipForRelation("food_catalog_governance_policy_versions")!;
    expect(isMigrationSeedKey(policy, ["plan6-v1"])).toBe(true);
    expect(isMigrationSeedKey(policy, ["plan7-runtime-policy"])).toBe(false);
    expect(policy.preseedComparisonOmit).toContain("created_at");
  });

  it("extracts stable key text without numeric coercion", () => {
    const key = stableKeyTextTuple({
      child_scope_code: { text: "PLAN7_DE" },
      parent_scope_code: { text: "EU" },
    }, ["child_scope_code", "parent_scope_code"]);
    expect(key).toEqual(["PLAN7_DE", "EU"]);
  });
});
