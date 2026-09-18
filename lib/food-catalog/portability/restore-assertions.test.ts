import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MANDATORY_RESTORE_ASSERTION_IDS,
  assertExactOwnerBindings,
  assertRedirectGraph,
  assertTransientNeutralization,
  buildPrePointerVerificationSql,
  compareExactTypedRows,
  compareHashEvidence,
  evaluateRestoreAssertions,
  type RestoreAssertionEvidence,
} from "./restore-assertions";

function passingAssertions(): RestoreAssertionEvidence[] {
  return MANDATORY_RESTORE_ASSERTION_IDS.map((id, index) => ({
    id,
    comparisonClass: index % 3 === 0 ? "BYTE_HASH" : index % 3 === 1 ? "EXACT_IDENTITY_VALUE" : "SEMANTIC",
    mandatory: true,
    status: "PASS",
    detail: "fixture proof",
  }));
}

describe("Plan 7 restore assertion engine", () => {
  it("requires every mandatory comparison class before trusting a FULL_DR restore without owning final DR readiness", () => {
    const result = evaluateRestoreAssertions({ profile: "FULL_DR", artifactValid: true, assertions: passingAssertions() });
    expect(result).toMatchObject({ trusted: true, restoreVerified: true });
    expect(Object.hasOwn(result, "drReady")).toBe(false);
    expect(result.comparisonClasses).toEqual(["BYTE_HASH", "EXACT_IDENTITY_VALUE", "SEMANTIC"]);
  });

  it("fails closed when any mandatory assertion is missing/unknown or explicitly fails", () => {
    const missing = passingAssertions().filter((assertion) => assertion.id !== "current_pointer");
    expect(evaluateRestoreAssertions({ profile: "FULL_DR", artifactValid: true, assertions: missing })).toMatchObject({ trusted: false, restoreVerified: false });

    const unknown = passingAssertions().map((assertion) => assertion.id === "security_rls_acl_identity" ? { ...assertion, status: "UNKNOWN" as const } : assertion);
    expect(evaluateRestoreAssertions({ profile: "FULL_DR", artifactValid: true, assertions: unknown }).unknown).toContain("security_rls_acl_identity");

    const failed = passingAssertions().map((assertion) => assertion.id === "merge_graph" ? { ...assertion, status: "FAIL" as const } : assertion);
    expect(evaluateRestoreAssertions({ profile: "FULL_DR", artifactValid: true, assertions: failed }).failures).toContain("merge_graph");
  });

  it("treats canonical required IDs as mandatory even when caller evidence attempts mandatory:false", () => {
    const failedDowngrade = passingAssertions().map((assertion) => assertion.id === "merge_graph"
      ? { ...assertion, mandatory: false, status: "FAIL" as const }
      : assertion);
    const failedResult = evaluateRestoreAssertions({ profile: "FULL_DR", artifactValid: true, assertions: failedDowngrade });
    expect(failedResult).toMatchObject({ trusted: false, restoreVerified: false });
    expect(failedResult.failures).toContain("merge_graph");

    const unknownDowngrade = passingAssertions().map((assertion) => assertion.id === "merge_graph"
      ? { ...assertion, mandatory: false, status: "UNKNOWN" as const }
      : assertion);
    const unknownResult = evaluateRestoreAssertions({ profile: "FULL_DR", artifactValid: true, assertions: unknownDowngrade });
    expect(unknownResult).toMatchObject({ trusted: false, restoreVerified: false });
    expect(unknownResult.unknown).toContain("merge_graph");

    const passWithCallerDowngrades = passingAssertions().map((assertion) => ({ ...assertion, mandatory: false }));
    expect(evaluateRestoreAssertions({ profile: "FULL_DR", artifactValid: true, assertions: passWithCallerDowngrades }))
      .toMatchObject({ trusted: true, restoreVerified: true });
  });

  it("never exposes final DR readiness even when CORE assertions pass", () => {
    const result = evaluateRestoreAssertions({ profile: "CORE_PORTABLE", artifactValid: true, assertions: passingAssertions() });
    expect(result).toMatchObject({ trusted: true, restoreVerified: true });
    expect(Object.hasOwn(result, "drReady")).toBe(false);
  });

  it("compares hashes and typed rows exactly without numeric coercion", () => {
    expect(compareHashEvidence("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(() => compareHashEvidence("a".repeat(64), "b".repeat(64))).toThrow(/hash|digest/i);
    expect(compareExactTypedRows(
      ['[["id","int8","9007199254740993"]]'],
      ['[["id","int8","9007199254740993"]]'],
    )).toBe(true);
    expect(() => compareExactTypedRows(
      ['[["id","numeric","1.000000000000000001"]]'],
      ['[["id","numeric","1"]]'],
    )).toThrow(/exact/i);
  });

  it("rejects redirect cycles/missing roots and validates exact owner identity binding", () => {
    expect(() => assertRedirectGraph({
      canonicalFoodIds: ["a", "b"],
      redirects: [{ sourceFoodId: "a", targetFoodId: "b" }, { sourceFoodId: "b", targetFoodId: "a" }],
    })).toThrow(/cycle/i);
    expect(() => assertRedirectGraph({
      canonicalFoodIds: ["a"], redirects: [{ sourceFoodId: "a", targetFoodId: "missing" }],
    })).toThrow(/target|missing/i);
    expect(assertExactOwnerBindings([{ sourceOwnerId: "u1", targetOwnerId: "u1", matches: 1 }])).toBe(true);
    expect(() => assertExactOwnerBindings([{ sourceOwnerId: "u1", targetOwnerId: "u2", matches: 1 }])).toThrow(/owner|identity/i);
    expect(() => assertExactOwnerBindings([{ sourceOwnerId: "u1", targetOwnerId: "u1", matches: 2 }])).toThrow(/ambiguous|exact/i);
  });

  it("requires restore-time lease/claim fields to be neutralized exactly", () => {
    expect(assertTransientNeutralization({ lease_owner: null, lease_token: null, lease_expires_at: null }, ["lease_owner", "lease_token", "lease_expires_at"])).toBe(true);
    expect(() => assertTransientNeutralization({ lease_owner: "worker", lease_token: null }, ["lease_owner", "lease_token"])).toThrow(/neutral/i);
  });

  it("requires canonical Plan 3 composition recomputation and selected verification/activation/finding semantics before pointer restore", () => {
    const sql = buildPrePointerVerificationSql({
      currentGenerationId: "71000000-0000-4000-8000-000000000901",
      currentEventId: "71000000-0000-4000-8000-000000000921",
      currentValidationReportId: "71000000-0000-4000-8000-000000000911",
      transientRules: [
        { relation: "food_ingestion_runs", fields: ["lease_owner", "lease_token", "lease_acquired_at", "lease_heartbeat_at", "lease_expires_at"] },
        { relation: "food_catalog_governance_outbox", fields: ["claim_owner", "claim_principal_id", "lease_token", "lease_acquired_at", "lease_expires_at"] },
      ],
    });
    expect(sql).toContain("food_catalog_generation_validation_reports");
    expect(sql).toContain("food_catalog_generation_events");
    expect(sql).not.toContain("RESTORE_POINTER_FIELDS_LAST");

    const runtime = readFileSync("lib/food-catalog/portability/pre-pointer-generation-runtime.mjs", "utf8");
    for (const fragment of [
      "validateGenerationSemanticSnapshot",
      "computeGenerationCompositionChecksum",
      "food_verification_assertions",
      "food_catalog_activation_set_members",
      "food_catalog_activation_sets",
      "food_catalog_activation_events",
      "food_catalog_generation_validation_findings",
      "sourceLegalAccepted",
      "eligibility",
      "blocking",
    ]) expect(runtime).toContain(fragment);

    const wrapper = readFileSync("lib/food-catalog/portability/pre-pointer-verification.mjs", "utf8");
    expect(wrapper).not.toMatch(/restore-food-catalog-portable\.mjs/);
    expect(wrapper).not.toMatch(/process\.argv|PLAN7_RESTORE_DATABASE_URL/);
    expect(wrapper).toMatch(/buildPrePointerVerificationSql\(input,\s*databaseUrl\)/);
    expect(wrapper).toMatch(/explicit disposable restore database URL/);
    expect(wrapper).toMatch(/verifyCanonicalPrePointerGeneration/);
  });
});
