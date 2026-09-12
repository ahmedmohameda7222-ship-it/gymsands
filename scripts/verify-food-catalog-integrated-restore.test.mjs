import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comparePortableRelationRows,
  buildFinalAssertionEvidence,
  computeRestoredTargetIdentitySha256,
} from "./verify-food-catalog-integrated-restore.mjs";

const row = (entries) => JSON.stringify(entries);
const exact = row([
  ["id","uuid","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  ["value","numeric","90071992547409931234567890.1200"],
]);

describe("Plan 7 integrated restore evidence", () => {
  it("requires exact typed row equality for ordinary portable authority", () => {
    const result = comparePortableRelationRows({
      relation: "food_nutrition_revisions",
      stableKey: ["id"],
      sourceRows: [exact],
      targetRows: [exact],
      restoreOwnership: "UNIFORM",
      loadMode: "RESTORE_EXACT",
    });
    assert.deepEqual(result, { relation: "food_nutrition_revisions", rowCount: 1, exact: true, transientNeutralized: true });
    assert.throws(() => comparePortableRelationRows({
      relation: "food_nutrition_revisions",
      stableKey: ["id"],
      sourceRows: [exact],
      targetRows: [row([["id","uuid","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],["value","numeric","90071992547409931234567890.12"]])],
      restoreOwnership: "UNIFORM",
      loadMode: "RESTORE_EXACT",
    }), /exact|typed|mismatch/i);
  });

  it("permits declared migration replay-time columns only for known seed keys", () => {
    const sourceSeed = row([["created_at","timestamp with time zone","2026-09-10 18:00:00+00"],["node_code","text","protein_foods"]]);
    const targetSeed = row([["created_at","timestamp with time zone","2026-09-10 18:05:00+00"],["node_code","text","protein_foods"]]);
    const result = comparePortableRelationRows({
      relation: "food_taxonomy_nodes",
      stableKey: ["node_code"],
      sourceRows: [sourceSeed],
      targetRows: [targetSeed],
      restoreOwnership: "MIXED_KEYED_PRESEEDED_RUNTIME",
      loadMode: "VALIDATE_PRESEEDED",
      seedPolicy: { relation: "food_taxonomy_nodes", migrationSeedKeys: [["protein_foods"]], preseedComparisonOmit: ["created_at"] },
    });
    assert.equal(result.exact, true);
    const sourceRuntime = row([["created_at","timestamp with time zone","2026-09-10 18:00:00+00"],["node_code","text","runtime_node"]]);
    const targetRuntime = row([["created_at","timestamp with time zone","2026-09-10 18:05:00+00"],["node_code","text","runtime_node"]]);
    assert.throws(() => comparePortableRelationRows({
      relation: "food_taxonomy_nodes",
      stableKey: ["node_code"],
      sourceRows: [sourceRuntime],
      targetRows: [targetRuntime],
      restoreOwnership: "MIXED_KEYED_PRESEEDED_RUNTIME",
      loadMode: "VALIDATE_PRESEEDED",
      seedPolicy: { relation: "food_taxonomy_nodes", migrationSeedKeys: [["protein_foods"]], preseedComparisonOmit: ["created_at"] },
    }), /exact|runtime|mismatch/i);
  });

  it("uses declared replay-local omissions for pure migration-owned preseed validation", () => {
    const sourceSeed = row([
      ["created_at","timestamp with time zone","2026-09-10 18:00:00+00"],
      ["display_name","text","Cuisine"],
      ["namespace_code","text","cuisine"],
    ]);
    const targetSeed = row([
      ["created_at","timestamp with time zone","2026-09-10 18:05:00+00"],
      ["display_name","text","Cuisine"],
      ["namespace_code","text","cuisine"],
    ]);
    const seedPolicy = {
      relation: "food_taxonomy_namespaces",
      migrationSeedKeys: [["cuisine"]],
      preseedComparisonOmit: ["created_at"],
    };
    const result = comparePortableRelationRows({
      relation: "food_taxonomy_namespaces",
      stableKey: ["namespace_code"],
      sourceRows: [sourceSeed],
      targetRows: [targetSeed],
      restoreOwnership: "UNIFORM",
      loadMode: "VALIDATE_PRESEEDED",
      seedPolicy,
    });
    assert.equal(result.exact, true);

    const semanticallyDifferentTarget = row([
      ["created_at","timestamp with time zone","2026-09-10 18:05:00+00"],
      ["display_name","text","Cuisine changed"],
      ["namespace_code","text","cuisine"],
    ]);
    assert.throws(() => comparePortableRelationRows({
      relation: "food_taxonomy_namespaces",
      stableKey: ["namespace_code"],
      sourceRows: [sourceSeed],
      targetRows: [semanticallyDifferentTarget],
      restoreOwnership: "UNIFORM",
      loadMode: "VALIDATE_PRESEEDED",
      seedPolicy,
    }), /preseed|semantic|mismatch/i);
  });

  it("requires transient lease fields to be null on the restored target", () => {
    const source = row([["id","uuid","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],["lease_owner","text","worker-a"],["lease_token","uuid","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]]);
    const target = row([["id","uuid","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],["lease_owner","text",null],["lease_token","uuid",null]]);
    assert.equal(comparePortableRelationRows({
      relation: "food_ingestion_runs",
      stableKey: ["id"],
      sourceRows: [source],
      targetRows: [target],
      restoreOwnership: "UNIFORM",
      loadMode: "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION",
      transientNeutralize: ["lease_owner","lease_token"],
    }).transientNeutralized, true);
    assert.throws(() => comparePortableRelationRows({
      relation: "food_ingestion_runs",
      stableKey: ["id"],
      sourceRows: [source],
      targetRows: [source],
      restoreOwnership: "UNIFORM",
      loadMode: "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION",
      transientNeutralize: ["lease_owner","lease_token"],
    }), /neutral|transient|null/i);
  });

  it("derives transient neutralization proof from every registry-declared relation", async () => {
    const verifier = await import("./verify-food-catalog-integrated-restore.mjs");
    assert.equal(typeof verifier.areDeclaredTransientRelationsNeutralized, "function");
    const rules = [
      { relation: "food_ingestion_runs", loadMode: "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION" },
      { relation: "food_catalog_governance_outbox", loadMode: "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION" },
      { relation: "food_items", loadMode: "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY" },
    ];
    const bothVerified = [
      { relation: "food_ingestion_runs", transientNeutralized: true },
      { relation: "food_catalog_governance_outbox", transientNeutralized: true },
      { relation: "food_items", transientNeutralized: true },
    ];
    assert.equal(verifier.areDeclaredTransientRelationsNeutralized(rules, bothVerified), true);
    assert.equal(verifier.areDeclaredTransientRelationsNeutralized(rules, [
      bothVerified[0],
      { relation: "food_catalog_governance_outbox", transientNeutralized: false },
      bothVerified[2],
    ]), false);
    assert.equal(verifier.areDeclaredTransientRelationsNeutralized(rules, [bothVerified[0], bothVerified[2]]), false);
  });

  it("builds all mandatory assertions from runtime proof classes without caller trust booleans", () => {
    const evidence = buildFinalAssertionEvidence({
      artifactHashesVerified: true,
      transportVerified: true,
      exactRelationComparisonVerified: true,
      provenanceVerified: true,
      lineageVerified: true,
      taxonomyMarketBarcodeVerified: true,
      verificationActivationVerified: true,
      generationVerified: true,
      pointerVerified: true,
      mergeGraphVerified: true,
      governanceOwnerVerified: true,
      consumerReferencesVerified: true,
      securityVerified: true,
      migrationSchemaVerified: true,
      transientNeutralizationVerified: true,
    });
    assert.equal(evidence.length, 16);
    assert.ok(evidence.every((entry) => entry.status === "PASS" && entry.mandatory));
    assert.deepEqual(new Set(evidence.map((entry) => entry.comparisonClass)), new Set(["BYTE_HASH","EXACT_IDENTITY_VALUE","SEMANTIC"]));
  });

  it("binds current corrections and favorites into owner evidence and the governance/personal assertion", async () => {
    const verifier = await import("./verify-food-catalog-integrated-restore.mjs");
    assert.equal(typeof verifier.buildOwnerBindingEvidenceSql, "function");
    assert.equal(typeof verifier.areProtectedOwnerStateRelationsVerified, "function");
    const sql = verifier.buildOwnerBindingEvidenceSql();
    assert.match(sql, /food_personal_corrections/);
    assert.match(sql, /food_favorites/);

    const verified = new Map([
      ["food_catalog_governance_principals", { exact: true }],
      ["food_catalog_governance_capability_assignments", { exact: true }],
      ["food_catalog_governance_policy_versions", { exact: true }],
      ["food_catalog_governance_policy_pointer", { exact: true }],
      ["food_personal_override_revisions", { exact: true }],
      ["food_personal_overrides", { exact: true }],
      ["food_personal_override_operations", { exact: true }],
      ["food_personal_corrections", { exact: true }],
      ["food_favorites", { exact: true }],
    ]);
    assert.equal(verifier.areProtectedOwnerStateRelationsVerified(verified), true);
    verified.set("food_favorites", { exact: false });
    assert.equal(verifier.areProtectedOwnerStateRelationsVerified(verified), false);
  });

  it("binds the restored target identity to schema, security and owner-mapping evidence", () => {
    const a = computeRestoredTargetIdentitySha256({ migrationLedgerIdentity: "a".repeat(64), schemaFingerprintSha256: "b".repeat(64), securityRlsAclIdentitySha256: "c".repeat(64), ownerBindingSha256: "d".repeat(64) });
    const b = computeRestoredTargetIdentitySha256({ migrationLedgerIdentity: "a".repeat(64), schemaFingerprintSha256: "b".repeat(64), securityRlsAclIdentitySha256: "c".repeat(64), ownerBindingSha256: "e".repeat(64) });
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
  });
});
