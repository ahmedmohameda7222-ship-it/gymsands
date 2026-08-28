import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

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
    expect(offline).toContain('status: "queued"');
    expect(page).toContain("markMealPlanMutationFailed");
    expect(page).not.toContain('status: "needs_attention", lastError: cause');
  });

  it("uses timer UUIDs as instance identity and removes display-name uniqueness", () => {
    const store = source("lib/nutrition-v1/cooking-local-store.ts");
    const migration = source("supabase/migrations/20260828032300_nutrition_v1_timer_instance_identity.sql").toLowerCase();
    expect(store).not.toContain("item.actionStateId === timer.actionStateId\n    && item.name === timer.name");
    expect(store).toContain("item.id === timer.id");
    expect(migration).toContain("drop constraint if exists nutrition_cooking_timers_action_state_id_timer_name_key");
    expect(migration).toContain("create index if not exists nutrition_cooking_timers_action_name_idx");
    expect(migration).not.toContain("create unique index");
  });

  it("moves Recipe duplicate and Saved Meal multi-table writes behind transactional DB commands", () => {
    const migration = source("supabase/migrations/20260828032200_nutrition_v1_final_closure.sql").toLowerCase();
    const replayMigration = source("supabase/migrations/20260828220000_nutrition_v1_saved_meal_creation_idempotency.sql").toLowerCase();
    const recipeRoute = source("app/api/nutrition/v1/recipes/[recipeId]/route.ts");
    const recipeWorkspace = source("services/nutrition-v1/server/recipe-workspace.ts");
    const savedMeals = source("services/nutrition-v1/server/saved-meals.ts");
    expect(migration).toContain("create or replace function public.duplicate_nutrition_recipe");
    expect(migration).toContain("create or replace function public.create_nutrition_saved_meal");
    expect(migration).toContain("create or replace function public.update_nutrition_saved_meal");
    expect(replayMigration).toContain("create or replace function public.create_nutrition_saved_meal_idempotent");
    expect(replayMigration).toContain("public.create_nutrition_saved_meal(");
    expect(recipeRoute).toContain("duplicatePublishedRecipeAtomically");
    expect(recipeWorkspace).not.toContain("export async function duplicatePublishedRecipe(");
    expect(recipeWorkspace).not.toContain('await supabase.from("nutrition_recipes").delete().eq("id", root.id)');
    expect(savedMeals).toContain('rpc("create_nutrition_saved_meal_idempotent"');
    expect(savedMeals).toContain('rpc("update_nutrition_saved_meal"');
  });

  it("enforces Recipe cover ownership in database truth", () => {
    const migration = source("supabase/migrations/20260828032200_nutrition_v1_final_closure.sql").toLowerCase();
    expect(migration).toContain("recipe_cover_path_owner");
    expect(migration).toContain("split_part(cover_path, '/', 1) = user_id::text");
  });

  it("routes public MCP custom-meal creation to canonical Nutrition Saved Meals", () => {
    const publicSurface = source("lib/mcp/public-surface.ts");
    const canonical = source("lib/mcp/nutrition-v1-saved-meal.ts");
    expect(publicSurface).toContain('toolName === "create_custom_meal"');
    expect(publicSurface).toContain("createCanonicalSavedMealFromMcp");
    expect(canonical).toContain("createSavedMeal");
    expect(canonical).toContain("deriveMcpMutationOperationId");
    expect(canonical).toContain('authority: "nutrition_saved_meals"');
    expect(canonical).not.toContain('from("saved_recipes")');
    expect(canonical).not.toContain('from("saved_recipe_ingredients")');
  });

  it("connects every approved Add To producer to a destination consumer and canonical write route", () => {
    const foodDetail = source("components/nutrition/food-library/food-detail.tsx");
    const recipeDetail = source("components/nutrition/recipes/recipe-detail.tsx");
    const diaryPage = source("app/(private)/calories/page.tsx");
    const planPage = source("app/(private)/my-meal-plan/page.tsx");
    const recipePage = source("app/(private)/my-recipes/page.tsx");
    const consumer = source("components/nutrition/handoffs/add-to-handoff-consumer.tsx");
    const commit = source("app/api/nutrition/v1/handoffs/commit/route.ts");

    for (const destination of ["/calories?", "/my-meal-plan?", "savedMealFoodId=", "ingredientFoodId="]) {
      expect(foodDetail).toContain(destination);
    }
    expect(recipeDetail).toContain("source=recipe");
    expect(recipeDetail).toContain("destination=saved_meal");
    expect(diaryPage).toContain('destination="diary"');
    expect(diaryPage).toContain('destination="saved_meal"');
    expect(planPage).toContain('destination="meal_plan"');
    expect(recipePage).toContain('destination="recipe"');
    expect(consumer).toContain("/api/nutrition/v1/handoffs/commit");
    expect(commit).toContain("logDiaryMeal");
    expect(commit).toContain("mutateMealPlanWeek");
    expect(commit).toContain("createSavedMeal");
    expect(commit).toContain("autosaveRecipeDraft");
  });

  it("keeps Saved Meal contextual inside Diary and Meal Plan rather than adding a fifth peer destination", () => {
    const diary = source("components/nutrition/diary/logging-session.tsx");
    const plan = source("components/nutrition/meal-plan/add-to-plan-workspace.tsx");
    const navigation = source("lib/navigation/mobile-nav.ts");
    expect(diary).toContain('"saved-meals"');
    expect(plan).toContain('kind: "saved_meal"');
    expect(navigation).not.toMatch(/href:\s*["']\/saved-meals/);
  });
});
