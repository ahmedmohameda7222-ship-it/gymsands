import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migration = path.join(process.cwd(), "supabase/migrations/20260710195027_cimd_oauth_token_lifecycle.sql");

describe("CIMD OAuth lifecycle migration", () => {
  it("adds issuer, nbf, revocation, client binding, and assertion replay storage", async () => {
    const sql = await readFile(migration, "utf8");
    for (const fragment of [
      "oauth_client_id text",
      "client_id text",
      "issuer text",
      "not_before timestamptz",
      "revoked_at timestamptz",
      "mcp_oauth_client_assertions",
      "jti_hash text not null unique",
      "mcp_oauth_authorization_continuations",
      "continuation_hash text not null unique"
    ]) expect(sql).toContain(fragment);
  });

  it("keeps assertion data service-role-only and cleanup bounded", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).toContain("revoke all on table public.mcp_oauth_client_assertions from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, delete on table public.mcp_oauth_client_assertions to service_role");
    expect(sql).toContain("revoke all on table public.mcp_oauth_authorization_continuations from public, anon, authenticated");
    expect(sql).toContain("least(coalesce(p_batch_size, 1000), 5000)");
    expect(sql).not.toMatch(/drop\s+table/i);
  });
});
