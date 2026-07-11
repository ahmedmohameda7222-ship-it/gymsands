import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("MCP idempotency ledger migration", () => {
  it("stores hashes and minimized responses behind service-role-only grants", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase/migrations/20260710202758_mcp_idempotency_ledger.sql"), "utf8");
    expect(sql).toContain("unique (user_id, tool_name, key_hash)");
    expect(sql).toContain("input_hash text not null");
    expect(sql).toContain("response jsonb");
    expect(sql).toContain("revoke all on table public.mcp_idempotency_keys from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/idempotency_key\s+text/i);
  });
});
