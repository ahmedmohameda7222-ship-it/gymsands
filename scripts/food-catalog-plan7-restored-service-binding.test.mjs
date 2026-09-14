import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sourcePrincipalId = "71000000-0000-4000-8000-000000000d10";
const sourceIdentity = "plan7-source-service-identity";

describe("Plan 7 restored Service execution binding", () => {
  it("materializes an unreachable restore-local SHA-256 only for Service rows", async () => {
    const restore = await import("./restore-food-catalog-portable.mjs");
    assert.equal(typeof restore.materializeRestoreLocalBindings, "function");

    const serviceRow = JSON.stringify([
      ["id", "uuid", sourcePrincipalId],
      ["principal_type", "text", "service"],
      ["service_identity_sha256", "text", null],
      ["subject_id", "text", "plan7-portability-service"],
    ]);
    const humanRow = JSON.stringify([
      ["id", "uuid", "71000000-0000-4000-8000-000000000002"],
      ["principal_type", "text", "human"],
      ["service_identity_sha256", "text", null],
      ["subject_id", "text", "71000000-0000-4000-8000-000000000001"],
    ]);
    const rule = {
      relation: "food_catalog_governance_principals",
      restoreLocalBindings: [{
        column: "service_identity_sha256",
        discriminatorColumn: "principal_type",
        discriminatorValue: "service",
        strategy: "UNREACHABLE_SHA256",
      }],
    };
    const deterministic = () => "9".repeat(64);
    const materializedService = restore.materializeRestoreLocalBindings(serviceRow, rule, deterministic);
    const materializedHuman = restore.materializeRestoreLocalBindings(humanRow, rule, deterministic);
    const serviceDigest = JSON.parse(materializedService).find(([column]) => column === "service_identity_sha256")[2];
    const humanDigest = JSON.parse(materializedHuman).find(([column]) => column === "service_identity_sha256")[2];
    assert.equal(serviceDigest, "9".repeat(64));
    assert.equal(humanDigest, null);
  });

  it("uses a realistic source Service identity whose digest is portable-neutralized rather than copied", () => {
    const fixture = readFileSync("supabase/verification/food-catalog-plan7-portability-governance-outbox-fixture.sql", "utf8");
    assert.match(fixture, new RegExp(sourceIdentity));
    assert.match(fixture, /extensions\.digest\(convert_to\([^)]*plan7-source-service-identity[^)]*UTF8[^)]*\)[\s\S]*sha256/i);
    assert.doesNotMatch(fixture, /service_identity_sha256[\s\S]{0,240}repeat\('7',64\)/i);
  });

  it("requires the integrated restored target to reject source and random Service identities while preserving pending history", () => {
    const workflow = readFileSync(".github/workflows/food-catalog-plan7-integrated-full-dr.yml", "utf8");
    const step = workflow.match(/- name: Prove restored source Service execution binding is unavailable[\s\S]*?- name: Capture restored target RLS ACL identity/)?.[0] ?? "";
    assert.match(step, /capture-food-catalog-restored-service-authority\.mjs/);
    assert.match(step, new RegExp(sourceIdentity));
    assert.match(step, /sourceServiceIdentityRejected/);
    assert.match(step, /authenticatedClaimRejected/);
    assert.match(step, /randomServiceIdentityRejected/);
    assert.match(step, /principalHistoryPreserved/);
    assert.match(step, /capabilityHistoryPreserved/);
    assert.match(step, /outboxPendingUnclaimed/);
  });
});