import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260830155245_nullable_meal_plan_nutrition_snapshots.sql";
const plan4MigrationName = "20260904100000_food_catalog_ingestion_v2_authority.sql";
const plan5MigrationName = "20260906183000_food_catalog_search_projection_v2.sql";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("nullable Meal Plan snapshot migration boundary", () => {
  it("drops NOT NULL only from the four legacy Meal Plan nutrition snapshot columns", () => {
    const source = read(`supabase/migrations/${migrationName}`);

    for (const column of ["calories", "protein_g", "carbs_g", "fat_g"]) {
      expect(source).toMatch(new RegExp(`alter column ${column} drop not null`, "i"));
    }
    expect(source.match(/drop not null/gi)).toHaveLength(4);
    expect(source).not.toMatch(/\b(?:insert\s+into|update|delete\s+from|truncate)\b/i);
    expect(source).not.toMatch(/custom_meal_items|saved_recipe_ingredients/i);
    expect(source).not.toMatch(/alter\s+column\s+(?:quantity|status|completed_at|food_log_id)/i);
  });

  it("preserves the authorized Production aliases through reconciled Plan 5", () => {
    const ledger = JSON.parse(read("supabase/migration-ledger.json")) as {
      pendingCount: number;
      unresolvedCount: number;
      historyRepair: { state: string; pendingCount: number; unresolvedCount: number };
      entries: Array<Record<string, unknown>>;
    };
    const entries = ledger.entries.filter((entry) => entry.localFile === migrationName);
    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");

    expect(entries).toEqual([
      expect.objectContaining({
        localFile: migrationName,
        state: "applied_version_alias",
        productionVersion: "20260830170301",
        productionName: "nullable_meal_plan_nutrition_snapshots",
      }),
    ]);
    expect(pendingEntries).toEqual([]);
    const plan4Entry = ledger.entries.find((entry) => entry.localFile === plan4MigrationName);
    expect(plan4Entry).toEqual(expect.objectContaining({
      localFile: plan4MigrationName,
      state: "applied_version_alias",
      productionVersion: "20260906131808",
      productionName: "food_catalog_ingestion_v2_authority",
    }));
    const plan5Entry = ledger.entries.find((entry) => entry.localFile === plan5MigrationName);
    expect(plan5Entry).toEqual(expect.objectContaining({
      localFile: plan5MigrationName,
      state: "applied_version_alias",
      productionVersion: "20260906200129",
      productionName: "food_catalog_search_projection_v2",
    }));
    expect(ledger.pendingCount).toBe(0);
    expect(ledger.unresolvedCount).toBe(0);
    expect(ledger.historyRepair.state).toBe("reconciled");
    expect(ledger.historyRepair.pendingCount).toBe(0);
    expect(ledger.historyRepair.unresolvedCount).toBe(0);
  });

  it("keeps direct/manual Meal Plan authoring strict numeric", () => {
    const source = read("services/database/meal-plan.ts");
    const start = source.indexOf("type DirectMealInput");
    const end = source.indexOf("type MealPlanPatch", start);
    const directInput = source.slice(start, end);
    const payloadStart = source.indexOf("function validatedPayload");
    const payloadEnd = source.indexOf("function validatedExistingPayload", payloadStart);
    const payload = source.slice(payloadStart, payloadEnd);

    expect(directInput).toMatch(/calories\?: number;/);
    expect(directInput).toMatch(/protein\?: number;/);
    expect(directInput).toMatch(/carbs\?: number;/);
    expect(directInput).toMatch(/fat\?: number;/);
    expect(directInput).not.toMatch(/number\s*\|\s*null/);
    for (const field of ["calories", "protein", "carbs", "fat"]) {
      expect(payload).toMatch(new RegExp(`finiteNonNegative\\(input\\.${field},`));
    }
  });

  it("does not widen unrelated legacy frozen nutrition tables", () => {
    const legacyCompatibility = read("services/nutrition-v1/compatibility/legacy-nutrition.ts");
    const recipeSpeed = read("services/meals/food-logging-speed.ts");

    expect(legacyCompatibility).toMatch(/custom_meal_items/);
    expect(recipeSpeed).toMatch(/saved_recipe_ingredients/);
    expect(recipeSpeed).toMatch(/calories:\s*number/);
    expect(recipeSpeed).toMatch(/proteinG:\s*number/);
    expect(recipeSpeed).toMatch(/carbsG:\s*number/);
    expect(recipeSpeed).toMatch(/fatG:\s*number/);
  });
});