import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "app/api/nutrition/v1/foods/route.ts"), "utf8");
const row = readFileSync(resolve(process.cwd(), "components/nutrition/food-library/food-row.tsx"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "components/nutrition/food-library/food-detail.tsx"), "utf8");
const diaryLogger = readFileSync(resolve(process.cwd(), "components/nutrition/diary/logging-session.tsx"), "utf8");
const mealPlan = readFileSync(resolve(process.cwd(), "components/nutrition/meal-plan/add-to-plan-workspace.tsx"), "utf8");
const savedMealUtility = readFileSync(resolve(process.cwd(), "components/nutrition/saved-meals/saved-meal-utility.tsx"), "utf8");
const mcpSavedMeal = readFileSync(resolve(process.cwd(), "lib/mcp/nutrition-v1-saved-meal.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "services/nutrition-v1/server/food-library.ts"), "utf8");
const servingCorrection = readFileSync(resolve(process.cwd(), "supabase/migrations/20260907165500_food_catalog_search_serving_semantics_correction.sql"), "utf8");

describe("Plan 5 Food Library V2 consumer surface", () => {
  it("passes explicit BCP-47 language, script and market context without inferring market", () => {
    expect(route).toContain('url.searchParams.get("language")');
    expect(route).toContain('url.searchParams.get("script")');
    expect(route).toContain('url.searchParams.get("market")');
    expect(route).toContain("scriptCode:");
    expect(route).toContain("marketScopeCode:");
    expect(route).not.toMatch(/timezone|navigator\.language|geo|ip_address|country.*market/i);
    expect(service).toContain("p_language_tag: options.locale");
    expect(service).toContain("p_script_code: options.scriptCode");
    expect(service).toContain("p_market_scope_code: options.marketScopeCode");
  });

  it("exposes strict < > = filters for protein, carbs and fat while preserving existing inclusive compatibility", () => {
    for (const nutrient of ["protein", "carbs", "fat"]) {
      expect(route).toContain(`numericFilter(url.searchParams, "${nutrient}")`);
    }
    expect(route).toContain('operator === "gt"');
    expect(route).toContain('operator === "lt"');
    expect(route).toContain('operator === "eq"');
    expect(service).toContain('"gt" | "lt" | "eq"');
  });

  it("renders only SearchDocument-derived nutrition labels as High Protein / Low Carb convenience badges", () => {
    expect(row).toContain("food.nutritionLabels ?? []");
    expect(row).toContain('label === "high-protein"');
    expect(row).toContain('label === "low-carb"');
    expect(row).not.toMatch(/tags\.slice\(0, 2\)[\s\S]*high protein/i);
  });

  it("keeps global serving display nullable and never relabels nutrition basis as serving", () => {
    expect(service).toContain("servingLabel: string | null");
    expect(servingCorrection).toContain("alter column serving_label drop not null");
    expect(servingCorrection).toContain("set serving_label = null");
    expect(servingCorrection).not.toMatch(/nutrition_basis_unit\s*=\s*'ml'[\s\S]*100 ml/i);
    expect(servingCorrection).not.toMatch(/nutrition_basis_unit[\s\S]*100 g/i);
    expect(row).toContain("food.servingLabel ?");
    expect(detail).toContain("hasAuthoritativeServing");
  });

  it("fails closed for mutation consumers when a global Food has no authoritative serving while preserving My Foods", () => {
    expect(diaryLogger).toContain("if (!food.servingLabel)");
    expect(mealPlan).toContain("if (!food.servingLabel)");
    expect(savedMealUtility).toContain("if (!food.servingLabel)");
    expect(mcpSavedMeal).toContain("if (!selected.servingLabel)");
    expect(service).toContain('source: FoodLibrarySource');
  });
});
