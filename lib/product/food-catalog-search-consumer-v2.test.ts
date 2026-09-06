import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "app/api/nutrition/v1/foods/route.ts"), "utf8");
const row = readFileSync(resolve(process.cwd(), "components/nutrition/food-library/food-row.tsx"), "utf8");
const service = readFileSync(resolve(process.cwd(), "services/nutrition-v1/server/food-library.ts"), "utf8");

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
});
