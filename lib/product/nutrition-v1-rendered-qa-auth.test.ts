import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mealPlanApi = readFileSync("components/nutrition/meal-plan/meal-plan-api.ts", "utf8");
const recipeApi = readFileSync("components/nutrition/recipes/recipe-api.ts", "utf8");

describe("Nutrition V1 rendered-QA authentication boundary", () => {
  it("permits a non-secret mock request marker only inside the explicit production QA build", () => {
    for (const [name, source] of [["Meal Plan", mealPlanApi], ["My Recipes", recipeApi]] as const) {
      expect(source, name).toContain("env.useMockAuth");
      expect(source, name).toContain("env.productionQaBuild");
      expect(source, name).toContain("x-plaivra-rendered-qa");
      expect(source, name).toContain('supabase.auth.getSession()');
      expect(source, name).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
      expect(source, name).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });
});
