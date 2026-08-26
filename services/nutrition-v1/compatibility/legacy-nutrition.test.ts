import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adapterPath = "services/nutrition-v1/compatibility/legacy-nutrition.ts";
const reconciliationPath = "supabase/verification/nutrition-v1-legacy-reconciliation.sql";
const loggingSpeedPath = "services/meals/food-logging-speed.ts";
const convergencePath = "lib/architecture/canonical-convergence.test.ts";

describe("Nutrition V1 legacy compatibility authority", () => {
  it("provides one explicit conservative compatibility adapter", () => {
    expect(existsSync(adapterPath)).toBe(true);
    const adapter = readFileSync(adapterPath, "utf8");
    expect(adapter).toContain("saved_item_type");
    expect(adapter).toContain("custom_meals");
    expect(adapter).toContain("user_meal_plan_items");
    expect(adapter).toContain("food_logs");
    expect(adapter).toContain("unresolved");
    expect(adapter).not.toMatch(/\.delete\(|\.remove\(|drop\s+table|truncate\s+/i);
  });

  it("delegates legacy recipe/custom-meal reads instead of defining their semantics locally", () => {
    const loggingSpeed = readFileSync(loggingSpeedPath, "utf8");
    expect(loggingSpeed).toContain("@/services/nutrition-v1/compatibility/legacy-nutrition");
    expect(loggingSpeed).toContain("readLegacySavedContent");
  });

  it("extends canonical convergence proof and adds read-only reconciliation SQL", () => {
    expect(existsSync(reconciliationPath)).toBe(true);
    const reconciliation = readFileSync(reconciliationPath, "utf8");
    const convergence = readFileSync(convergencePath, "utf8");
    expect(reconciliation).toContain("saved_recipes");
    expect(reconciliation).toContain("custom_meals");
    expect(reconciliation).toContain("user_meal_plan_items");
    expect(reconciliation).toContain("food_logs");
    expect(reconciliation).toContain("unresolved");
    expect(reconciliation).not.toMatch(/\b(delete|update|insert|drop|truncate|alter)\b/i);
    expect(convergence).toContain("nutrition-v1-legacy-reconciliation.sql");
    expect(convergence).toContain("legacy-nutrition.ts");
  });
});
