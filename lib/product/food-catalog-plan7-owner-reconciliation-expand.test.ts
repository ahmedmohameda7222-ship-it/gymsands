import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SUFFIX = "_food_catalog_owner_reconciliation_expand_authority.sql";

function migrationPath() {
  const matches = readdirSync("supabase/migrations").filter((name) => name.endsWith(SUFFIX)).sort();
  expect(matches, "exactly one Task 14 owner reconciliation expand migration must exist").toHaveLength(1);
  expect(matches[0]).toBe("20260924063000_food_catalog_owner_reconciliation_expand_authority.sql");
  return `supabase/migrations/${matches[0]}`;
}

function migrationSql() {
  return readFileSync(migrationPath(), "utf8").toLowerCase();
}

function functionSection(sql: string, qualifiedName: string) {
  const marker = `create or replace function ${qualifiedName.toLowerCase()}`;
  const start = sql.indexOf(marker);
  expect(start, `${qualifiedName} must exist`).toBeGreaterThanOrEqual(0);
  const bodyStart = sql.indexOf("$function$", start);
  expect(bodyStart, `${qualifiedName} body must start`).toBeGreaterThan(start);
  const end = sql.indexOf("$function$;", bodyStart + "$function$".length);
  expect(end, `${qualifiedName} body must terminate`).toBeGreaterThan(bodyStart);
  return sql.slice(start, end + "$function$;".length);
}

describe("Plan 7 Tasks 13-14 owner reconciliation expand authority", () => {
  it("is expand-only and leaves protected owner structures intact", () => {
    const sql = migrationSql();
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\balter\s+table[\s\S]*?\bdrop\s+(?:column|constraint)\b/i);
    expect(sql).not.toMatch(/\bdrop\s+function\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.user_food_favorites\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.food_personal_corrections\b/i);
  });

  it("extracts exact pointer semantics into a private trusted-owner core", () => {
    const sql = migrationSql();
    const core = functionSection(sql, "private.food_catalog_get_current_personal_override_for_owner_v1");
    expect(core).toMatch(/p_user_id\s+uuid[\s\S]*p_food_id\s+uuid/);
    expect(core).toContain("public.food_personal_overrides");
    expect(core).toContain("public.food_personal_override_revisions");
    expect(core).toMatch(/r\.id\s*=\s*o\.current_revision_id/);
    expect(core).toContain("r.user_id");
    expect(core).toContain("r.food_id");
    expect(core).toContain("r.revision_number");
    expect(core).toContain("o.pointer_revision");
    expect(core).not.toContain("auth.uid()");
    expect(core).not.toMatch(/order\s+by[\s\S]*revision_number[\s\S]*desc/);
    expect(core).not.toMatch(/max\s*\(\s*(?:r\.)?revision_number/);

    const browser = functionSection(sql, "public.food_catalog_get_current_personal_override_v1");
    expect(browser).toMatch(/v_user\s+uuid\s*:?=\s*auth\.uid\(\)/);
    expect(browser).toContain("private.food_catalog_governance_require_active_member_account(v_user)");
    expect(browser).toContain("private.food_catalog_get_current_personal_override_for_owner_v1(v_user, p_food_id)");
    expect(browser).not.toContain("public.food_personal_overrides");
  });

  it("derives MCP owner identity only from an active unrevoked connection", () => {
    const sql = migrationSql();
    const owner = functionSection(sql, "private.food_catalog_owner_for_active_mcp_connection_v1");
    expect(owner).toMatch(/p_connection_id\s+uuid/);
    expect(owner).toContain("public.chatgpt_connections");
    expect(owner).toMatch(/connection\.id\s*=\s*p_connection_id/);
    expect(owner).toMatch(/connection\.is_active\s*=\s*true/);
    expect(owner).toMatch(/connection\.revoked_at\s+is\s+null/);
    expect(owner).toContain("connection.user_id");
    expect(owner).not.toContain("p_user_id");
    expect(owner).not.toContain("request.jwt.claim.sub");
    expect(owner).not.toContain("set_config");

    const bridge = functionSection(sql, "public.food_catalog_get_current_personal_override_for_mcp_v1");
    expect(bridge).toMatch(/p_connection_id\s+uuid[\s\S]*p_food_id\s+uuid/);
    expect(bridge).not.toContain("p_user_id");
    expect(bridge).toContain("private.food_catalog_owner_for_active_mcp_connection_v1(p_connection_id)");
    expect(bridge).toContain("private.food_catalog_get_current_personal_override_for_owner_v1");
  });

  it("keeps the public V2 search signature and delegates to an explicit trusted-owner core", () => {
    const sql = migrationSql();
    const browser = functionSection(sql, "public.search_food_catalog_v2");
    expect(browser).toMatch(
      /public\.search_food_catalog_v2\s*\(\s*p_query\s+text\s+default\s+''[\s\S]*p_filters\s+jsonb\s+default\s+'\{\}'::jsonb\s*\)/,
    );
    expect(browser).toMatch(/v_user_id\s+uuid\s*:?=\s*auth\.uid\(\)/);
    expect(browser).toContain("private.search_food_catalog_v2_for_owner_v1");
    expect(browser).not.toContain("food_personal_corrections");

    const core = functionSection(sql, "private.search_food_catalog_v2_for_owner_v1");
    expect(core).toMatch(/p_user_id\s+uuid[\s\S]*p_query\s+text/);
    expect(core).toContain("public.food_catalog_current_generation");
    expect(core).toContain("public.food_catalog_search_documents");
    expect(core).toContain("public.food_catalog_generation_foods");
    expect(core).toContain("public.food_nutrition_revisions");
    expect(core).toContain("private.food_catalog_get_current_personal_override_for_owner_v1");
    expect(core).toContain("private.food_catalog_search_per_100_v2");
    expect(core).not.toContain("food_personal_corrections");
    expect(core).not.toContain("correction.");
    for (const key of [
      "calories",
      "protein_g",
      "carbs_g",
      "fat_g",
      "saturated_fat_g",
      "fiber_g",
      "sugars_g",
      "sodium_mg",
    ]) {
      expect(core).toContain(`'${key}'`);
    }
    expect(core).toContain("nutrition.basis_amount");
    expect(core).toContain("nutrition.basis_unit");
  });

  it("treats only active numeric Plan 6 nutrients as participating personal values", () => {
    const sql = migrationSql();
    const numeric = functionSection(sql, "private.food_catalog_personal_override_numeric_v1");
    expect(numeric).toContain("jsonb_typeof");
    expect(numeric).toContain("'number'");
    expect(numeric).toContain("isdeleted");
    expect(numeric).toContain("nutritionoverride");
    expect(numeric).toContain("p_key");

    const active = functionSection(sql, "private.food_catalog_personal_override_has_nutrition_v1");
    expect(active).toContain("private.food_catalog_personal_override_numeric_v1");
    expect(active).toContain("is not null");
  });

  it("adds a service-role-only MCP V2 search wrapper without caller owner input", () => {
    const sql = migrationSql();
    const bridge = functionSection(sql, "public.search_food_catalog_v2_for_mcp_v1");
    expect(bridge).toMatch(/p_connection_id\s+uuid[\s\S]*p_query\s+text/);
    expect(bridge).not.toContain("p_user_id");
    expect(bridge).toContain("private.food_catalog_owner_for_active_mcp_connection_v1(p_connection_id)");
    expect(bridge).toContain("private.search_food_catalog_v2_for_owner_v1");

    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.search_food_catalog_v2_for_mcp_v1\([^;]+\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.search_food_catalog_v2_for_mcp_v1\([^;]+\)\s+to\s+service_role/i,
    );
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.search_food_catalog_v2_for_mcp_v1\([^;]+\)\s+to\s+(?:public|anon|authenticated)/i,
    );
  });

  it("preserves browser grants and does not widen protected Personal Override table access", () => {
    const sql = migrationSql();
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.search_food_catalog_v2\(text,\s*text,\s*text,\s*text,\s*text,\s*integer,\s*text,\s*text,\s*text,\s*jsonb\)\s+from\s+public\s*,\s*anon/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.search_food_catalog_v2\(text,\s*text,\s*text,\s*text,\s*text,\s*integer,\s*text,\s*text,\s*text,\s*jsonb\)\s+to\s+authenticated\s*,\s*service_role/i,
    );
    expect(sql).not.toMatch(
      /grant\s+select\s+on(?:\s+table)?\s+public\.food_personal_override(?:s|_revisions|_operations)[^;]*\b(?:anon|authenticated|service_role)\b/i,
    );
    expect(sql).not.toContain("request.jwt.claim.sub");
    expect(sql).not.toContain("set_config(");
  });
});
