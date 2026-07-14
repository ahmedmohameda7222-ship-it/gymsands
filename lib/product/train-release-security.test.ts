import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionPreflight = readFileSync(
  "supabase/verification/production-release-migration-preflight.sql",
  "utf8"
);
const rpcSecurity = readFileSync(
  "supabase/verification/train-atomic-rpc-security.sql",
  "utf8"
);
const qualityWorkflow = readFileSync(".github/workflows/quality.yml", "utf8");

const canonicalRpcs = [
  "activate_workout_plan_atomic",
  "archive_workout_plan_atomic",
  "create_workout_plan_atomic",
  "delete_workout_plan_atomic",
  "save_workout_plan_atomic",
  "save_workout_plan_day_atomic"
];

describe("Train release security controls", () => {
  it("expects the canonical plan RPCs to remain SECURITY INVOKER", () => {
    for (const name of canonicalRpcs) {
      expect(productionPreflight).toMatch(
        new RegExp(`public\\.${name}\\([^']+\\)', false\\)`)
      );
    }
    expect(productionPreflight).toContain("train_rpc_grant_mismatch");
    expect(productionPreflight).toContain("granted_function.proacl");
  });

  it("fails the psql process after displaying any blocking result rows", () => {
    expect(productionPreflight).toMatch(
      /select issue_type, object_identity, details[\s\S]*order by issue_type, object_identity;/
    );
    expect(productionPreflight).toContain("\\if :ROW_COUNT");
    expect(productionPreflight).toContain("\\quit 3");
    expect(productionPreflight).toContain("0 blocking findings");
  });

  it("runs disposable behavioral security verification in the database preflight gate", () => {
    expect(qualityWorkflow).toContain(
      "-f supabase/verification/train-atomic-rpc-security.sql"
    );
    for (const name of canonicalRpcs) {
      expect(rpcSecurity).toContain(`public.${name}(`);
      expect(rpcSecurity).toContain(`${name} unexpectedly succeeded`);
    }
    expect(rpcSecurity).toContain("Train RPC must remain SECURITY INVOKER");
    expect(rpcSecurity).toContain("has_function_privilege('authenticated'");
    expect(rpcSecurity).toContain("has_function_privilege('service_role'");
    expect(rpcSecurity).toContain("has_function_privilege('anon'");
    expect(rpcSecurity).toContain("A denied Train RPC mutated member data.");
    expect(rpcSecurity).toContain("-- Cross-user denial");
    expect(rpcSecurity).toContain("-- Impersonation denial");
    expect(rpcSecurity).toContain("-- Anonymous denial");
    expect(rpcSecurity.trimEnd()).toContain("rollback;");
  });
});
