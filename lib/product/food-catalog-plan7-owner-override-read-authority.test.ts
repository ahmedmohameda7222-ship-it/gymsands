import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SUFFIX = "_food_catalog_owner_override_read_authority.sql";
const migrationFiles = readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(SUFFIX))
  .sort();

function migrationSql() {
  expect(migrationFiles, "exactly one owner-override read authority migration must exist").toHaveLength(1);
  return readFileSync(`supabase/migrations/${migrationFiles[0]}`, "utf8").toLowerCase();
}

function rpcSection(sql: string) {
  const marker = "create or replace function public.food_catalog_get_current_personal_override_v1";
  const start = sql.indexOf(marker);
  expect(start, "owner override read RPC must exist").toBeGreaterThanOrEqual(0);
  const tail = sql.slice(start);
  const end = tail.indexOf("$function$;", tail.indexOf("$function$") + "$function$".length);
  expect(end, "owner override read RPC body must terminate").toBeGreaterThan(0);
  return tail.slice(0, end + "$function$;".length);
}

describe("Plan 7 Task 9 prerequisite owner override read authority", () => {
  it("defines exactly one narrow authenticated owner point-read RPC", () => {
    const sql = migrationSql();
    const rpc = rpcSection(sql);

    expect(rpc).toMatch(
      /create\s+or\s+replace\s+function\s+public\.food_catalog_get_current_personal_override_v1\s*\(\s*p_food_id\s+uuid\s*\)\s*returns\s+jsonb/i,
    );
    expect(rpc).not.toContain("p_user_id");
    expect(rpc).toContain("language plpgsql");
    expect(rpc).toContain("security definer");
    expect(rpc).toMatch(/set\s+search_path\s*=\s*''/i);
    expect(rpc).toMatch(/v_user\s+uuid\s*:?=\s*auth\.uid\(\)/i);
    expect(rpc).toContain("private.food_catalog_governance_require_active_member_account(v_user)");
    expect(rpc).not.toContain("food_catalog_export_owner_personal_overrides_v1");
  });

  it("resolves the exact pointer and never infers a latest revision", () => {
    const rpc = rpcSection(migrationSql());

    expect(rpc).toMatch(/from\s+public\.food_personal_overrides\s+o/i);
    expect(rpc).toMatch(
      /join\s+public\.food_personal_override_revisions\s+r\s+on\s+r\.id\s*=\s*o\.current_revision_id/i,
    );
    expect(rpc).toMatch(/where\s+o\.user_id\s*=\s*v_user\s+and\s+o\.food_id\s*=\s*p_food_id/i);
    expect(rpc).toContain("r.user_id");
    expect(rpc).toContain("r.food_id");
    expect(rpc).toContain("r.revision_number");
    expect(rpc).toContain("o.pointer_revision");
    expect(rpc).not.toMatch(/order\s+by[\s\S]*revision_number[\s\S]*desc[\s\S]*limit\s+1/i);
    expect(rpc).not.toMatch(/max\s*\(\s*(?:r\.)?revision_number\s*\)/i);
  });

  it("keeps Personal Override tables closed and exposes only authenticated EXECUTE", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.food_catalog_get_current_personal_override_v1\s*\(\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.food_catalog_get_current_personal_override_v1\s*\(\s*uuid\s*\)\s+to\s+authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant\s+select\s+on(?:\s+table)?\s+public\.food_personal_override(?:s|_revisions|_operations)[^;]*\b(?:anon|authenticated|service_role)\b/i,
    );
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.food_catalog_get_current_personal_override_v1\s*\(\s*uuid\s*\)\s+to\s+(?:public|anon|service_role)/i,
    );
  });
});
