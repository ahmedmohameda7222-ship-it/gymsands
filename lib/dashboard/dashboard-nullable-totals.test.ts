import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard nullable nutrition handoff", () => {
  it("preserves known nutrients independently when another nutrient is unknown", () => {
    const dashboard = readFileSync(
      resolve(process.cwd(), "components/dashboard/today-dashboard.tsx"),
      "utf8",
    );
    const progress = readFileSync(
      resolve(process.cwd(), "components/dashboard/today-progress.tsx"),
      "utf8",
    );

    expect(dashboard).not.toContain("completeNutritionTotals");
    expect(dashboard).toMatch(
      /const totals =\s*nutritionLogs\s*\?\s*\{[\s\S]*calories:\s*nutritionLogs\.totals\.calories,[\s\S]*protein_g:\s*nutritionLogs\.totals\.proteinG,[\s\S]*carbs_g:\s*nutritionLogs\.totals\.carbsG,[\s\S]*fat_g:\s*nutritionLogs\.totals\.fatG,[\s\S]*\}\s*:\s*null;/,
    );
    expect(progress).toMatch(
      /type MacroTotals = \{ calories: number \| null; protein_g: number \| null; carbs_g: number \| null; fat_g: number \| null \};/,
    );
  });
});
