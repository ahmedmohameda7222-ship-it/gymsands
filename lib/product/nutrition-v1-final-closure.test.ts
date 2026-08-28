import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

function functionBody(text: string, name: string) {
  const start = text.indexOf(`async function ${name}`);
  if (start < 0) return "";
  const next = text.indexOf("\nasync function ", start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

describe("Nutrition V1 final closure regressions", () => {
  it("keeps every Food Library and Meal Plan barcode request on authenticated client authority", () => {
    expect(existsSync("components/nutrition/food-library/food-library-api.ts")).toBe(true);
    const page = source("components/nutrition/food-library/food-library-page.tsx");
    const custom = source("components/nutrition/food-library/custom-food-workspace.tsx");
    const barcode = source("components/nutrition/food-library/barcode-lookup.tsx");
    const planAdd = source("components/nutrition/meal-plan/add-to-plan-workspace.tsx");
    expect(page).toContain("foodLibraryApi");
    expect(custom).toContain("foodLibraryApi");
    expect(barcode).toContain("foodLibraryApi");
    expect(planAdd).toContain("mealPlanApi");
    expect(barcode).not.toMatch(/fetch\(`\/api\/food\/open-food-facts/);
    expect(planAdd).not.toMatch(/fetch\(`\/api\/food\/open-food-facts/);
  });

  it("keeps transient Meal Plan synchronization failures retryable instead of terminal", () => {
    const offline = source("lib/nutrition-v1/meal-plan-offline.ts");
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    expect(offline).toContain("markMealPlanMutationRetryable");
    expect(page).toContain("markMealPlanMutationRetryable");
  });

  it("reuses a Cooking timer identity for the same action-state/name pair", () => {
    const store = source("lib/nutrition-v1/cooking-local-store.ts");
    const mode = source("components/nutrition/cooking/cooking-mode.tsx");
    expect(store).toContain("upsertCookingLocalTimer");
    expect(mode).toContain("upsertCookingLocalTimer");
  });

  it("moves Recipe duplicate and Saved Meal multi-table writes behind transactional DB commands", () => {
    const migration = source("supabase/migrations/20260828032000_nutrition_v1_final_architecture_corrections.sql").toLowerCase();
    const recipeRoute = source("app/api/nutrition/v1/recipes/[recipeId]/route.ts");
    const savedMeals = source("services/nutrition-v1/server/saved-meals.ts");
    expect(migration).toContain("duplicate_nutrition_recipe");
    expect(migration).toContain("create_nutrition_saved_meal");
    expect(migration).toContain("update_nutrition_saved_meal");
    expect(recipeRoute).toContain("duplicatePublishedRecipeAtomic");
    expect(savedMeals).toContain('rpc("create_nutrition_saved_meal"');
    expect(savedMeals).toContain('rpc("update_nutrition_saved_meal"');
  });

  it("enforces Recipe cover ownership in database truth", () => {
    const migration = source("supabase/migrations/20260828032000_nutrition_v1_final_architecture_corrections.sql").toLowerCase();
    expect(migration).toContain("recipe_cover_path_owner");
    expect(migration).toContain("split_part(cover_path, '/', 1) = user_id::text");
  });

  it("persists MCP custom meals in the canonical Saved Meal domain, never legacy saved_recipes", () => {
    const executor = source("lib/mcp/tool-executor-safe.ts");
    const body = functionBody(executor, "createCustomMeal");
    expect(body).toContain("nutrition_saved_meals");
    expect(body).not.toContain('.from("saved_recipes")');
    expect(body).not.toContain('.from("saved_recipe_ingredients")');
  });

  it("has live consumers for standalone Food and Recipe Add To handoffs", () => {
    const diary = source("components/nutrition/diary/diary-page.tsx");
    const mealPlan = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    const recipeHome = source("components/nutrition/recipes/recipe-home.tsx");
    expect(diary).toContain('searchParams.get("addFoodId")');
    expect(diary).toContain('searchParams.get("source")');
    expect(mealPlan).toContain('params.get("addFoodId")');
    expect(recipeHome).toContain('ingredientFoodId');
  });
});
