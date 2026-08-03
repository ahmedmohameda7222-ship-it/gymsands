import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260803152000_private_app_bootstrap_v1.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("PCS-2 private app bootstrap migration", () => {
  it("defines one argument-free authenticated owner authority", () => {
    expect(sql).toMatch(
      /create or replace function public\.get_private_app_bootstrap_v1\(\)/i,
    );
    expect(sql).toMatch(/actor_id uuid := auth\.uid\(\)/i);
    expect(sql).toMatch(/if actor_id is null then/i);
    expect(sql).not.toMatch(/get_private_app_bootstrap_v1\([^)]*uuid/i);
  });

  it("is stable, security-definer, fixed-search-path, and least privilege", () => {
    expect(sql).toMatch(/language plpgsql\s+stable\s+security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public/i);
    expect(sql).toMatch(
      /revoke all on function public\.get_private_app_bootstrap_v1\(\) from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.get_private_app_bootstrap_v1\(\) to authenticated, service_role/i,
    );
  });

  it("returns only bootstrap facts and contains no data mutation", () => {
    expect(sql).toMatch(/returns jsonb/i);
    expect(sql).toContain("'contractVersion', 1");
    expect(sql).toContain("'userId', actor_id");
    expect(sql).toContain("'accountAccessState'");
    expect(sql).toContain("'consentRecords'");
    expect(sql).toContain("'onboarding'");
    expect(sql).toContain("'settings'");
    expect(sql).not.toMatch(/\b(insert|update|delete|merge|truncate)\b/i);
  });
});
