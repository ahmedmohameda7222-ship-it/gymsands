import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION_FILE = "20261008060000_food_catalog_plan7_retirement_prerequisite.sql";
const MIGRATION_PATH = `supabase/migrations/${MIGRATION_FILE}`;
const VERIFICATION_PATH = "supabase/verification/food-catalog-plan7-retirement-prerequisite.sql";
const REGISTRY_PATH = "scripts/run-database-verification.mjs";

const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const migration = read(MIGRATION_PATH);
const migrationLower = migration.toLowerCase();
const verifier = read(VERIFICATION_PATH);
const registry = read(REGISTRY_PATH);

function functionBlock(name: string) {
  const start = migrationLower.indexOf(`create or replace function ${name.toLowerCase()}`);
  if (start < 0) return "";
  const end = migrationLower.indexOf("$function$;", start);
  return end < 0 ? migrationLower.slice(start) : migrationLower.slice(start, end + "$function$;".length);
}

function stripFunctionBodies(sql: string) {
  return sql.replace(/\$function\$[\s\S]*?\$function\$/gi, "$function$<body>$function$");
}

describe("Plan 7 retirement prerequisite migration", () => {
  it("allocates the exact forward-only prerequisite migration and permanent verifier", () => {
    expect(migration).not.toBe("");
    expect(verifier).not.toBe("");
    expect(registry).toContain(VERIFICATION_PATH);

    const verifierIndex = registry.indexOf(VERIFICATION_PATH);
    const releasePreflightIndex = registry.indexOf("supabase/verification/production-release-migration-preflight.sql");
    expect(verifierIndex).toBeGreaterThanOrEqual(0);
    expect(releasePreflightIndex).toBeGreaterThan(verifierIndex);
  });

  it("cuts current Search V2 off legacy Personal Corrections without weakening Plan 6 authority", () => {
    const search = functionBlock("private.food_catalog_search_v2_for_owner_v1");

    expect(search).not.toBe("");
    expect(search).not.toContain("public.food_personal_corrections");
    expect(search).not.toContain("correction.");
    expect(search).toContain("public.food_personal_overrides");
    expect(search).toContain("public.food_personal_override_revisions");
    expect(search).toContain("revision.revision_number is distinct from pointer.pointer_revision");
    expect(search).toContain("override_revision.revision_number = override_pointer.pointer_revision");
    expect(search).toContain("jsonb_typeof(override_revision.nutrition_override");
    expect(search).toContain("public.food_catalog_generation_foods");
    expect(search).toContain("public.food_nutrition_revisions");
    expect(search).toContain("private.food_catalog_search_per_100_v2");
    expect(search).toContain("v_cursor_context_sha256");
    expect(search).toContain("candidate.match_tier");
    expect(search).toContain("doc.generation_id = v_generation_id");
    expect(search).toContain("doc.projection_version = v_projection_version");
  });

  it("removes only the legacy correction-table dependency from canonical account purge", () => {
    const purge = functionBlock("private.nutrition_v1_final_review_core_purge_account_application_data_atomic");

    expect(purge).not.toBe("");
    expect(purge).not.toContain("public.food_personal_corrections");
    expect(purge).toContain("private.nutrition_v1_core_purge_account_application_data_atomic(p_user_id)");
    expect(purge).toContain("delete from public.food_favorites where user_id = p_user_id");
    expect(purge).toContain("'food_personal_corrections_deleted', v_food_personal_corrections");
    expect(purge).toContain("v_food_personal_corrections integer := 0");

    for (const table of [
      "nutrition_cooking_timers",
      "nutrition_cooking_action_states",
      "nutrition_cooking_sessions",
      "nutrition_meal_plan_change_requests",
      "nutrition_planned_occurrences",
      "nutrition_meal_plan_weeks",
      "nutrition_log_group_items",
      "nutrition_log_groups",
      "nutrition_saved_meal_items",
      "nutrition_saved_meals",
      "nutrition_recipe_ingredients",
      "nutrition_recipe_actions",
      "nutrition_recipe_equipment",
      "nutrition_recipe_drafts",
      "nutrition_recipe_versions",
      "nutrition_recipes",
      "nutrition_target_periods",
      "food_favorites",
    ]) {
      expect(purge).toContain(`delete from public.${table} where user_id = p_user_id`);
    }
  });

  it("stages old Search contract disable by revocation only", () => {
    expect(migrationLower).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.search_nutrition_food_library\(text,text,text,integer,text,text,text,jsonb\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/,
    );
    expect(migrationLower).not.toMatch(/drop\s+function\s+public\.search_nutrition_food_library/);
  });

  it("contains no destructive DDL or top-level owner/catalog data mutation", () => {
    const outsideBodies = stripFunctionBodies(migrationLower);
    expect(outsideBodies).not.toMatch(/\bdrop\s+(?:table|column|function)\b/);
    expect(outsideBodies).not.toMatch(/\bcascade\b/);
    expect(outsideBodies).not.toMatch(/\btruncate\b/);
    expect(outsideBodies).not.toMatch(/\binsert\s+into\b/);
    expect(outsideBodies).not.toMatch(/\bupdate\s+(?:public|private)\./);
    expect(outsideBodies).not.toMatch(/\bdelete\s+from\b/);
    expect(migrationLower).not.toMatch(/(?:drop|alter)\s+table\s+public\.(?:food_aliases|food_market_relevance|food_personal_corrections|user_food_favorites|food_items)/);
    expect(migrationLower).not.toContain("release_schema_compatibility");
  });

  it("keeps the verifier fail-closed on Search ACLs, owner state, and retained objects", () => {
    const lower = verifier.toLowerCase();
    expect(lower).toContain("food_catalog_plan7_retirement_prerequisite");
    expect(lower).toContain("not has_function_privilege('authenticated','public.search_nutrition_food_library");
    expect(lower).toContain("not has_function_privilege('service_role','public.search_nutrition_food_library");
    expect(lower).toContain("to_regprocedure('public.search_nutrition_food_library");
    expect(lower).toContain("public.search_food_catalog_v2");
    expect(lower).toContain("public.search_food_catalog_v2_for_mcp_v1");
    expect(lower).toContain("public.user_food_favorites");
    expect(lower).toContain("public.food_personal_corrections");
    expect(lower).toContain("rollback;");
  });
});
