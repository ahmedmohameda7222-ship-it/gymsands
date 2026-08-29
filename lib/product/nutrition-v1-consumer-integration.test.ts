import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const canonicalNutritionOwnerTables = [
  "nutrition_recipes",
  "nutrition_recipe_versions",
  "nutrition_recipe_drafts",
  "nutrition_recipe_ingredients",
  "nutrition_recipe_actions",
  "nutrition_recipe_equipment",
  "nutrition_saved_meals",
  "nutrition_saved_meal_items",
  "nutrition_target_periods",
  "nutrition_meal_plan_weeks",
  "nutrition_planned_occurrences",
  "nutrition_meal_plan_change_requests",
  "nutrition_log_groups",
  "nutrition_log_group_items",
  "nutrition_cooking_sessions",
  "nutrition_cooking_action_states",
  "nutrition_cooking_timers",
  "food_personal_corrections",
  "food_favorites",
] as const;

describe("Nutrition V1 privacy and consumer integration", () => {
  it("exports the complete canonical owner graph with frozen consumer lineage", () => {
    const exportSource = source("lib/privacy/data-export.ts");
    for (const table of canonicalNutritionOwnerTables) expect(exportSource).toContain(`"${table}"`);
    expect(exportSource).toContain("frozen_snapshot");
    expect(exportSource).toContain("frozen_recipe_snapshot");
    expect(exportSource).toContain("frozen_item_snapshot");

    const legacy = source("lib/privacy/data-export-legacy.ts");
    expect(legacy).toContain('bucket: "recipe-covers"');
    expect(legacy).toContain("cover_path");
  });

  it("purges canonical Nutrition rows and recipe-cover objects before Auth deletion", () => {
    const worker = source("lib/privacy/account-deletion-worker.ts");
    expect(worker).toContain('from("recipe-covers")');
    expect(worker).toContain("cover_path");
    expect(worker.indexOf('rpc("purge_account_application_data_atomic"')).toBeLessThan(worker.indexOf("auth.admin.deleteUser"));

    const migration = source("supabase/migrations/20260825120400_nutrition_v1_privacy_purge_authority.sql");
    for (const table of canonicalNutritionOwnerTables) expect(migration).toContain(table);
    expect(migration).toContain("nutrition_v1_core_purge_account_application_data_atomic");
    expect(migration).toContain("purge_account_application_data_atomic");

    const verification = source("supabase/verification/nutrition-v1-privacy-purge.sql");
    expect(verification).toContain("purge_account_application_data_atomic");
    expect(verification).toContain("nutrition_recipes");
    expect(verification).toContain("nutrition_cooking_sessions");
    expect(verification).toContain("nutrition_planned_occurrences");
  });

  it("keeps intended Meal Plan and actual Diary facts distinct on Today", () => {
    const server = source("services/dashboard/today-projection-server.ts");
    const contract = source("lib/dashboard/today-projection-contract.ts");

    expect(server).toContain('from("nutrition_planned_occurrences")');
    expect(server).toContain('from("nutrition_log_groups")');
    expect(server).not.toContain('from("user_meal_plan_items")');
    expect(contract).toContain("mealSlotKey: string");
    expect(contract).toContain("calories: number | null");
    expect(contract).toContain("proteinG: number | null");
    expect(contract).toContain('"completed_changed"');
  });

  it("reports actual Diary facts without restoring a Nutrition Summary destination", () => {
    const reporting = source("services/reports/reporting.ts");
    expect(reporting).toContain('REPORTING_NUTRITION_SOURCE = "actual_diary"');
    expect(reporting).not.toContain("/calories/weekly-overview");
    expect(reporting).not.toContain("Nutrition Summary");
  });

  it("minimizes MCP nutrition context onto canonical targets, actuals, and intended plan facts", () => {
    const projections = source("lib/mcp/context-projections.ts");
    const executor = source("lib/mcp/tool-executor-safe.ts");

    expect(projections).toContain('from("nutrition_target_periods")');
    expect(projections).toContain('from("nutrition_log_groups")');
    expect(projections).toContain('from("nutrition_planned_occurrences")');
    expect(projections).not.toContain('from("user_meal_plan_items")');

    expect(executor).toContain('from("nutrition_meal_plan_weeks")');
    expect(executor).toContain('from("nutrition_planned_occurrences")');
    expect(executor).not.toContain('from("user_meal_plan_items")');
  });
});
