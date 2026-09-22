import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function section(path: string, start: string, end: string) {
  const value = source(path);
  const startIndex = value.indexOf(start);
  expect(startIndex, `${path}: missing start marker ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = value.indexOf(end, startIndex + start.length);
  expect(endIndex, `${path}: missing end marker ${end}`).toBeGreaterThan(startIndex);
  return value.slice(startIndex, endIndex);
}

describe("Plan 7 Tasks 9-12 consumer current-truth retirement contract", () => {
  it("keeps new catalog handoff on current generation + Plan 6 Personal Override authority", () => {
    const handoff = source("services/nutrition-v1/server/food-handoff.ts");
    const overrides = source("services/nutrition-v1/server/personal-overrides.ts");
    const userFoods = source("services/nutrition-v1/server/user-foods.ts");

    expect(handoff).toContain("resolveCurrentGenerationFoodForNewUse");
    expect(handoff).toContain("projectCurrentGenerationCompatibility");
    expect(handoff).toContain("readCurrentPersonalOverride");
    expect(handoff).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(handoff).not.toContain("food_personal_corrections");

    expect(overrides).toContain("food_catalog_get_current_personal_override_v1");
    expect(overrides).not.toContain("food_personal_corrections");

    expect(userFoods).toContain("food_catalog_set_personal_override");
    expect(userFoods).toContain("listFoodLibrary");
    expect(userFoods).not.toContain("findCatalogDuplicateByName");
    expect(userFoods).not.toContain("food_personal_corrections");
  });

  it("keeps Recipe current verification on generation-selected trust", () => {
    for (const path of [
      "services/nutrition-v1/server/recipe-published.ts",
      "services/nutrition-v1/server/recipe-workspace.ts",
    ]) {
      const value = source(path);
      expect(value, path).toContain("getCurrentCatalogTrustStates");
      expect(value, path).not.toContain("getCatalogVerificationStates");
      expect(value, path).not.toMatch(/\.from\(["']food_items["']\)/);
    }

    const trust = source("services/nutrition-v1/server/current-food-trust.ts");
    expect(trust).toContain("resolveCurrentGenerationTrustForNewUseBatchFromSupabase");
    expect(trust).toContain("batch.get(foodId)?.trust?.verified === true");
    expect(trust).not.toContain("resolveCurrentGenerationFoodForNewUseFromSupabase");
    expect(trust).not.toMatch(/\.from\(["']food_items["']\)/);
  });

  it("keeps MCP global Food search on Food Catalog V2", () => {
    for (const path of [
      "lib/mcp/nutrition-v1-food-execution.ts",
      "lib/mcp/tool-executor-implementation.ts",
    ]) {
      const value = source(path);
      expect(value, path).toContain("listFoodLibrary");
      expect(value, path).not.toContain("searchCatalogFoodsByName");
      expect(value, path).not.toMatch(/\.from\(["']food_items["']\)/);
    }
  });

  it("keeps normal browser Food search on V2 while category facets use authenticated current-projection authority", () => {
    const nutrition = source("services/database/nutrition.ts");
    const globalReads = section(
      "services/database/nutrition.ts",
      "async function searchCurrentCatalogCandidates(",
      "export async function getCalorieTargets",
    );
    const globalLog = section(
      "services/database/nutrition.ts",
      "export async function addGlobalFoodToToday(",
      "function normalizeUserFood",
    );
    const planWrite = section(
      "services/database/nutrition.ts",
      "export async function addFoodToMealPlan(",
      "export async function markMealPlanItemDone",
    );
    const browser = source("components/meals/food-browser.tsx");
    const categoryRoute = source("app/api/nutrition/v1/foods/categories/route.ts");
    const categoryFacets = source("services/food-catalog/server/current-search-category-facets.ts");
    const categoryBrowserRead = section(
      "services/database/nutrition.ts",
      "export async function getFoodCategories()",
      "export async function getGlobalFoods",
    );

    expect(globalReads).toContain('supabase.rpc("search_food_catalog_v2"');
    expect(categoryBrowserRead).toContain("/api/nutrition/v1/foods/categories");
    expect(categoryBrowserRead).toContain("supabase.auth.getSession");
    expect(categoryBrowserRead).not.toContain("searchCurrentCatalog");
    expect(categoryBrowserRead).not.toContain("search_food_catalog_v2");
    expect(categoryRoute.indexOf("requireNutritionUser(request)")).toBeLessThan(
      categoryRoute.indexOf("createSupabaseServerClient(null, true)"),
    );
    expect(categoryRoute).toContain("listCurrentFoodCatalogCategoryFacets(catalogSupabase)");
    expect(categoryFacets).toContain('"food_catalog_current_generation"');
    expect(categoryFacets).toContain('"food_catalog_generations"');
    expect(categoryFacets).toContain('"food_catalog_search_documents"');
    expect(categoryFacets).toContain('.eq("projection_version", projectionVersion)');
    expect(categoryFacets).toContain(".range(start, start + PAGE_SIZE - 1)");
    expect(categoryFacets).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(categoryFacets).not.toContain("getDefaultFoodCategories");
    expect(globalReads).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(globalReads).not.toContain("cuisine: options.kitchen");
    expect(globalLog).toContain("resolveBrowserCatalogHandoff");
    expect(planWrite).toContain("resolveBrowserCatalogHandoff");
    expect(browser).not.toContain("@/data/egyptian-foods");
    expect(nutrition).not.toContain("@/data/egyptian-foods");
  });

  it("keeps prompt and admin current Food facts off flat compatibility columns", () => {
    const prompt = source("services/database/planned-meal-prompt-context.ts");
    const quality = source("app/api/admin/quality/route.ts");
    const qualityReadModel = source("services/food-catalog/server/current-generation-quality.ts");
    const generationReadAdapter = source("services/food-catalog/server/supabase-generation-read-store.ts");

    expect(prompt).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(quality).toContain("getCurrentGenerationQuality");
    expect(quality).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(qualityReadModel).toContain("readSupabaseCurrentGenerationQualitySelection");
    expect(qualityReadModel).toContain("readSupabaseCurrentGenerationQualityFacts");
    expect(qualityReadModel).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(generationReadAdapter).toContain("food_catalog_current_generation");
    expect(generationReadAdapter).toContain("food_catalog_generation_foods");
    expect(generationReadAdapter).not.toMatch(/\.from\(["']food_items["']\)/);
  });

  it("keeps barcode authority canonical-first and provider results suggestion-only", () => {
    const barcode = source("services/nutrition-v1/server/barcode-lookup.ts");
    const route = source("app/api/food/open-food-facts/route.ts");

    expect(barcode).toContain("food_catalog_lookup_effective_barcode");
    expect(barcode).toContain("resolveCurrentGenerationFoodForNewUse");
    expect(barcode).toContain('kind: "provider_suggestion"');
    expect(barcode.indexOf("food_catalog_lookup_effective_barcode")).toBeLessThan(barcode.indexOf("providerLookup(barcode)"));
    expect(route).toContain("resolveFoodBarcode");
    expect(route).toContain("resolveFoodHandoff");
    expect(route).not.toMatch(/\.from\(["']food_items["']\)/);
  });


  it("keeps Plan 7 Product generation reads in the server-only catalog trust domain", () => {
    const handoffRoute = source("app/api/nutrition/v1/foods/[foodId]/handoff/route.ts");
    const handoff = source("services/nutrition-v1/server/food-handoff.ts");
    const recipeRoute = source("app/api/nutrition/v1/recipes/[recipeId]/route.ts");
    const recipePublished = source("services/nutrition-v1/server/recipe-published.ts");
    const recipeWorkspace = source("services/nutrition-v1/server/recipe-workspace.ts");
    const qualityRoute = source("app/api/admin/quality/route.ts");
    const barcodeRoute = source("app/api/food/open-food-facts/route.ts");
    const browserNutrition = source("services/database/nutrition.ts");
    const generationAcl = source("supabase/migrations/20260902150000_food_catalog_generation_authority.sql");

    expect(handoffRoute).toContain("createSupabaseServerClient(null, true)");
    expect(handoffRoute).toContain("resolveFoodHandoffWithAuthorities(context.supabase, catalogSupabase");
    expect(handoff).toContain("resolveCurrentGenerationFoodForNewUseFromSupabase(catalogSupabase");
    expect(handoff).toContain("readCurrentPersonalOverride(ownerSupabase");
    expect(handoff).toContain('ownerSupabase\n      .from("user_food_items")');

    expect(recipeRoute).toContain("createSupabaseServerClient(null, true)");
    expect(recipePublished).toContain("getCurrentCatalogTrustStates(catalogSupabase");
    expect(recipePublished).toContain('ownerSupabase.from("nutrition_recipes")');
    expect(recipeWorkspace).toContain("getCurrentCatalogTrustStates(catalogSupabase");

    expect(qualityRoute.indexOf("requireAdmin(request)")).toBeLessThan(qualityRoute.indexOf("createSupabaseServerClient(null, true)"));
    expect(qualityRoute).toContain("getCurrentGenerationQuality(catalogSupabase)");
    expect(barcodeRoute).toContain("resolveFoodBarcode(\n    context.supabase,\n    catalogSupabase");

    expect(browserNutrition).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(browserNutrition).not.toContain("createSupabaseServerClient");
    expect(generationAcl).toContain("grant select on public.food_catalog_current_generation to service_role");
    expect(generationAcl).not.toMatch(/grant select on public\.food_catalog_current_generation to authenticated/i);
  });

  it("preserves the exact selected V2 locale through normalization and handoff identity", () => {
    const nutrition = source("services/database/nutrition.ts");
    const types = source("types/database.ts");
    expect(types).toContain("locale?: string");
    expect(nutrition).toContain('locale: persistedText(food.locale, "Food locale")');
    expect(nutrition).toContain('typeof food.locale === "string" && food.locale.trim() ? food.locale.trim() : browserLocale()');
    expect(nutrition).not.toContain('languageTag: typeof navigator === "undefined" ? "en" : navigator.language');
  });

  it("does not globally ban low-level legacy ownership needed for later Plan 7 retirement work", () => {
    const legacy = source("services/food-catalog/server/legacy-compatibility.ts");
    const oldSavedMealHydration = section(
      "services/database/nutrition.ts",
      "async function foodsById(",
      "export async function getCustomMeals",
    );

    expect(legacy).toMatch(/\.from\(["']food_items["']\)/);
    expect(oldSavedMealHydration).toMatch(/\.from\(["']food_items["']\)/);
  });

  it("keeps selected-serving previews on the same projected nutrition authority as committed handoff", () => {
    const handoff = source("services/nutrition-v1/server/food-handoff.ts");
    const browserNutrition = source("services/database/nutrition.ts");
    const browser = source("components/meals/food-browser.tsx");
    const detail = source("components/nutrition/food-library/food-detail.tsx");
    const barcode = source("components/meals/eat-barcode-method.tsx");

    expect(handoff).toContain("nutrition:");
    expect(browserNutrition).toContain("choice.nutrition");
    expect(browser).toContain("withCatalogServingChoice(food, selectedServing)");
    expect(detail).toContain("selectedServingChoice?.nutrition");
    expect(barcode).toContain("selectedServing?.nutrition");
  });

  it("keeps canonical barcode presentation independent of bounded ranked discovery", () => {
    const barcode = source("services/nutrition-v1/server/barcode-lookup.ts");
    expect(barcode).not.toContain("listFoodLibrary");
    expect(barcode).not.toContain("limit: 20");
  });

  it("exposes exact serving identity in the MCP mutation contract", () => {
    const tools = source("lib/mcp/tools.ts");
    const execution = source("lib/mcp/nutrition-v1-food-execution.ts");
    expect(tools).toContain("serving_option_id");
    expect(execution).toContain('getOptionalString(item, "serving_option_id")');
  });

});
