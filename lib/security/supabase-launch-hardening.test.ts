import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/20260710194238_private_admin_rls_and_query_indexes.sql");

describe("Supabase launch hardening migration", () => {
  it("moves the admin helper out of public and constrains execution", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("function private.is_admin()");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = pg_catalog, public");
    expect(sql).toContain("revoke all on function private.is_admin() from public, anon");
    expect(sql).toContain("drop function public.is_admin()");
  });

  it("keeps OAuth and rate-limit tables service-only", async () => {
    const sql = await readFile(migrationPath, "utf8");
    for (const table of [
      "mcp_oauth_access_tokens",
      "mcp_oauth_authorization_codes",
      "mcp_rate_limits",
      "oauth_rate_limits"
    ]) {
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
      expect(sql).toContain(`on table public.${table} to service_role`);
    }
    expect(sql).not.toMatch(/grant\s+.+mcp_oauth_access_tokens\s+to\s+(?:anon|authenticated)/i);
  });

  it("does not remove unused or duplicate indexes automatically", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).not.toMatch(/drop\s+index/i);
    expect(sql).not.toMatch(/drop\s+table/i);
  });
});

describe("service-role bundle boundary", () => {
  it("marks the only service-role environment module server-only", async () => {
    const source = await readFile(path.join(root, "lib/integrations/env.ts"), "utf8");
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});
