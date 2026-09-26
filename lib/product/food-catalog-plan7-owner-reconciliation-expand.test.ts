import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_SUFFIX = "_food_catalog_plan7_owner_reconciliation_expand.sql";
const migrationFiles = readdirSync("supabase/migrations").filter((name) => name.endsWith(MIGRATION_SUFFIX)).sort();

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Plan 7 Tasks 13-14 owner reconciliation and expand authority", () => {
  it("has exactly one new expand migration and matching verification SQL", () => {
    expect(migrationFiles).toHaveLength(1);
    expect(source("supabase/verification/food-catalog-plan7-owner-reconciliation-expand.sql")).toContain(
      "food_catalog_plan7_owner_reconciliation_expand",
    );
    expect(source("scripts/run-database-verification.mjs")).toContain(
      "supabase/verification/food-catalog-plan7-owner-reconciliation-expand.sql",
    );
  });

  it("keeps the public browser search signature while delegating to an explicit-owner private core", () => {
    const sql = source(`supabase/migrations/${migrationFiles[0]}`).toLowerCase();
    expect(sql).toContain("private.food_catalog_search_v2_for_owner_v1");
    expect(sql).toContain("create or replace function public.search_food_catalog_v2(");
    expect(sql).toContain("create or replace function public.search_food_catalog_v2_for_mcp_v1(");
    expect(sql).toContain("p_connection_id uuid");
    expect(sql).not.toContain("set_config('request.jwt.claim.sub");
  });

  it("keeps legacy Personal Correction as expand compatibility beneath exact Plan 6 pointer authority", () => {
    const sql = source(`supabase/migrations/${migrationFiles[0]}`).toLowerCase();
    const coreStart = sql.indexOf("create or replace function private.food_catalog_search_v2_for_owner_v1");
    const coreEnd = sql.indexOf("create or replace function public.search_food_catalog_v2(", coreStart);
    const core = sql.slice(coreStart, coreEnd);
    expect(core).toContain("food_personal_overrides");
    expect(core).toContain("food_personal_override_revisions");
    expect(core).toContain("food_personal_corrections");
    expect(core).toContain("correction.is_active = true");
    expect(core).toContain("override_pointer.user_id is null");
    expect(core).toContain("food_catalog_generation_foods");
    expect(core).toContain("food_nutrition_revisions");
    expect(core).toContain("private.food_catalog_search_per_100_v2");
  });

  it("shares Personal Override resolution and exposes only a service-role MCP bridge", () => {
    const sql = source(`supabase/migrations/${migrationFiles[0]}`).toLowerCase();
    expect(sql).toContain("private.food_catalog_get_current_personal_override_for_owner_v1");
    expect(sql).toContain("public.food_catalog_get_current_personal_override_for_mcp_v1");
    expect(sql).toContain("chatgpt_connections");
    expect(sql).toContain("is_active = true");
    expect(sql).toContain("revoked_at is null");
    expect(sql).toMatch(/grant execute on function public\.food_catalog_get_current_personal_override_for_mcp_v1\([^;]+\)\s*to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.food_catalog_get_current_personal_override_for_mcp_v1\([^;]+\)\s*to authenticated/);
  });

  it("wires MCP search and override reads through connection-derived RPCs", () => {
    const library = source("services/nutrition-v1/server/food-library.ts");
    const overrides = source("services/nutrition-v1/server/personal-overrides.ts");
    const foodExecution = source("lib/mcp/nutrition-v1-food-execution.ts");
    const savedMeal = source("lib/mcp/nutrition-v1-saved-meal.ts");

    expect(library).toContain("listFoodLibraryForMcp");
    expect(library).toContain("search_food_catalog_v2_for_mcp_v1");
    expect(overrides).toContain("readCurrentPersonalOverrideForMcp");
    expect(overrides).toContain("food_catalog_get_current_personal_override_for_mcp_v1");
    expect(foodExecution).toContain("ctx.connectionId");
    expect(savedMeal).toContain("ctx.connectionId");
  });

  it("routes source-known Catalog favorites to canonical food_favorites without inferring UUID source", () => {
    const speed = source("services/meals/food-logging-speed.ts");
    const browser = source("components/meals/food-browser.tsx");

    expect(speed).toContain('export type FoodFavoriteAuthority = "catalog" | "legacy"');
    expect(speed).toContain('.from("food_favorites")');
    expect(speed).toContain('authority === "catalog"');
    expect(browser).toContain('authority: food.is_global === false ? "legacy" : "catalog"');
    expect(speed).toContain('.from("user_food_favorites")');
  });

  it("keeps Task 14 expand-only and records the fifth pending repository migration", () => {
    const sql = source(`supabase/migrations/${migrationFiles[0]}`).toLowerCase();
    expect(sql).not.toMatch(/\bdrop\s+(table|column|function)\b/);
    const ledger = JSON.parse(source("supabase/migration-ledger.json"));
    expect(ledger.pendingCount).toBe(5);
    expect(ledger.unresolvedCount).toBe(5);
    expect(ledger.entries.filter((entry: { state: string }) => entry.state === "pending")).toHaveLength(5);
  });

  it("ships a read-only owner reconciliation report with the required aggregate surface", () => {
    const report = source("scripts/report-food-catalog-plan7-owner-reconciliation.mjs");
    for (const key of [
      "total",
      "catalog_mappable",
      "catalog_already_mapped",
      "my_food_preserved",
      "legacy_text_preserved",
      "blocked",
      "personal_corrections",
    ]) {
      expect(report).toContain(key);
    }
    expect(report).toContain("--diagnostic");
    expect(report.toLowerCase()).not.toContain("delete from");
    expect(report.toLowerCase()).not.toContain("update public.");
  });
});
