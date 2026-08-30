import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260830155245_nullable_meal_plan_nutrition_snapshots.sql";

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
