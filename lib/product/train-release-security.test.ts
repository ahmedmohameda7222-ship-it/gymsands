import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionPreflight = readFileSync(
  "supabase/verification/production-release-migration-preflight.sql",
  "utf8"
);
const productionPreflightControl = readFileSync(
  "supabase/verification/production-release-migration-preflight-control.psql",
  "utf8"
);
const productionPreflightBehavior = readFileSync(
  "scripts/test-database-preflight-control.mjs",
  "utf8"
);
const productionPreflightFixture = readFileSync(
  "supabase/verification/production-release-migration-preflight-control-fixture.sql",
  "utf8"
);
const rpcSecurity = readFileSync(
  "supabase/verification/train-atomic-rpc-security.sql",
  "utf8"
);
const hardeningMigration = readFileSync(
  "supabase/migrations/20260714030000_harden_train_plan_rpc_execution.sql",
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
  it("expects the canonical plan RPCs to use the ownership-checked SECURITY DEFINER boundary", () => {
    for (const name of canonicalRpcs) {
      expect(productionPreflight).toMatch(
        new RegExp(`public\\.${name}\\([^']+\\)', true\\)`)
      );
    }
    expect(productionPreflight).toContain("train_rpc_grant_mismatch");
    expect(productionPreflight).toContain("granted_function.proacl");
    expect(hardeningMigration).toContain("Refusing to elevate Train RPC without its actor check");
    expect(hardeningMigration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    for (const name of canonicalRpcs) {
      expect(hardeningMigration).toContain(`alter function public.${name}(`);
    }
    expect(hardeningMigration.match(/security definer set search_path = '';/g)).toHaveLength(6);
  });

  it("derives an explicit Boolean and shares its executable fail-closed control", () => {
    expect(productionPreflight).toMatch(
      /count\(\*\)::integer as blocking_finding_count[\s\S]*\(count\(\*\) > 0\) as has_blocking_findings/
    );
    expect(productionPreflight).toContain("\\gset preflight_");
    expect(productionPreflight).toContain(
      "\\ir production-release-migration-preflight-control.psql"
    );
    expect(productionPreflight).not.toContain("\\if :ROW_COUNT");
    expect(productionPreflightControl).toContain(
      "\\if :preflight_has_blocking_findings"
    );
    expect(productionPreflightControl).toContain(
      "select 1 / 0 as blocking_findings_must_fail_closed"
    );
    expect(productionPreflightControl).toContain(":preflight_blocking_findings");
    expect(productionPreflightBehavior).toContain("[0, 1, 2, 6]");
    expect(productionPreflightFixture).toContain("begin read only;");
    expect(productionPreflightFixture).toContain("(count(*) > 0) as has_blocking_findings");
    expect(productionPreflightFixture).toContain("\\gset preflight_");
    expect(productionPreflightFixture).toContain(
      "\\ir production-release-migration-preflight-control.psql"
    );
    expect(qualityWorkflow).toContain("node scripts/test-database-preflight-control.mjs");
  });

  it("runs disposable behavioral security verification in the database preflight gate", () => {
    expect(qualityWorkflow).toContain(
      "-f supabase/verification/train-atomic-rpc-security.sql"
    );
    for (const name of canonicalRpcs) {
      expect(rpcSecurity).toContain(`public.${name}(`);
      expect(rpcSecurity).toContain(`${name} unexpectedly succeeded`);
    }
    expect(rpcSecurity).toContain("Train RPC must use SECURITY DEFINER");
    expect(rpcSecurity).toContain("has_function_privilege('authenticated'");
    expect(rpcSecurity).toContain("has_function_privilege('service_role'");
    expect(rpcSecurity).toContain("-- Service-role success");
    expect(rpcSecurity).toContain("has_function_privilege('anon'");
    expect(rpcSecurity).toContain("A denied Train RPC mutated member data.");
    expect(rpcSecurity).toContain("-- Cross-user denial");
    expect(rpcSecurity).toContain("-- Impersonation denial");
    expect(rpcSecurity).toContain("-- Anonymous denial");
    expect(rpcSecurity.trimEnd()).toContain("rollback;");
  });
});
