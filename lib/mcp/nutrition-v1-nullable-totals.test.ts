import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { sumCanonicalFoodMcpTotals } from "@/lib/mcp/nutrition-v1-food-execution";

describe("Nutrition V1 MCP nullable Food totals", () => {
  it("keeps fully known nutrition totals numeric", () => {
    expect(sumCanonicalFoodMcpTotals([
      { calories: 100, protein_g: 10, carbs_g: 20, fat_g: 2 },
      { calories: 50, protein_g: 5, carbs_g: 10, fat_g: 1 },
    ])).toEqual({ calories: 150, protein_g: 15, carbs_g: 30, fat_g: 3 });
  });

  it("keeps a legitimate numeric zero as zero", () => {
    expect(sumCanonicalFoodMcpTotals([
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    ])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it("preserves unknown independently for each nutrient", () => {
    expect(sumCanonicalFoodMcpTotals([
      { calories: 100, protein_g: null, carbs_g: 20, fat_g: 2 },
    ])).toEqual({ calories: 100, protein_g: null, carbs_g: 20, fat_g: 2 });
  });

  it("does not return a partial numeric total when any contributor for that nutrient is unknown", () => {
    expect(sumCanonicalFoodMcpTotals([
      { calories: 100, protein_g: 10, carbs_g: 20, fat_g: 2 },
      { calories: 50, protein_g: null, carbs_g: 5, fat_g: 1 },
    ])).toEqual({ calories: 150, protein_g: null, carbs_g: 25, fat_g: 3 });
  });

  it("keeps the canonical add_food_log response on the nullable-aware aggregation helper", () => {
    const source = readFileSync(join(process.cwd(), "lib/mcp/nutrition-v1-food-execution.ts"), "utf8");
    expect(source).toMatch(/totals:\s*sumCanonicalFoodMcpTotals/);
    expect(source).not.toMatch(/totals:\s*sumMacros/);
  });
});