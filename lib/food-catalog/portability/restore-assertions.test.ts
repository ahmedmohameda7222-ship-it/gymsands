import { describe, expect, it } from "vitest";
import {
  MANDATORY_RESTORE_ASSERTION_IDS,
  assertExactOwnerBindings,
  assertRedirectGraph,
  assertTransientNeutralization,
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
});
