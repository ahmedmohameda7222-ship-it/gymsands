import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260804174500_fix_profiles_update_policy_recursion.sql";
const verificationPath =
  "supabase/verification/20260804174500_fix_profiles_update_policy_recursion.sql";
const migration = readFileSync(migrationPath, "utf8");
const verification = readFileSync(verificationPath, "utf8");

function ownUpdatePolicy(sql: string) {
  const marker = "create policy profiles_update_own_basic";
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start);
}

describe("onboarding profile RLS recursion hotfix", () => {
  it("uses one narrowly scoped stable security-definer role check", () => {
    expect(migration).toContain(
      "create or replace function private.profile_role_unchanged",
    );
    expect(migration).toContain("returns boolean");
    expect(migration).toContain("stable");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("profile.id = (select auth.uid())");
    expect(migration).toContain("profile.role = candidate_role");
  });

  it("keeps own-row updates and role preservation without a recursive policy subquery", () => {
    const policy = ownUpdatePolicy(migration);
    expect(policy).toContain("id = (select auth.uid())");
    expect(policy).toContain("private.profile_role_unchanged(role)");
    expect(policy).not.toMatch(/from\s+public\.profiles/i);
    expect(policy).not.toMatch(/from\s+profiles/i);
  });

  it("does not expose the helper to anonymous callers", () => {
    expect(migration).toContain(
      "revoke all on function private.profile_role_unchanged(public.user_role)",
    );
    expect(migration).toContain("from public, anon");
    expect(migration).toContain(
      "to authenticated, service_role",
    );
  });

  it("ships immutable verification for ownership, function safety, and recursion removal", () => {
    expect(verification).toContain("helper_security_definer is not true");
    expect(verification).toContain("helper_volatility <> 's'");
    expect(verification).toContain("has_function_privilege('anon'");
    expect(verification).toContain("profiles_update_own_basic");
    expect(verification).toContain("private.profile_role_unchanged(role)");
    expect(verification).toContain("must not query profiles from its own policy");
  });
});
