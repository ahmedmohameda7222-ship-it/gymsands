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
    expect(trust).toContain("resolveCurrentGenerationFoodForNewUse");
    expect(trust).toContain("view.trust.verified");
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

  it("keeps current browser/category global reads on V2 and Egyptian data out of catalog results", () => {
    const nutrition = source("services/database/nutrition.ts");
    const globalReads = section(
      "services/database/nutrition.ts",
      "async function searchCurrentCatalog(",
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

    expect(globalReads).toContain('supabase.rpc("search_food_catalog_v2"');
    expect(globalReads).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(globalLog).toContain("resolveBrowserCatalogHandoff");
    expect(planWrite).toContain("resolveBrowserCatalogHandoff");
    expect(browser).not.toContain("@/data/egyptian-foods");
    expect(nutrition).not.toContain("@/data/egyptian-foods");
  });

  it("keeps prompt and admin current Food facts off flat compatibility columns", () => {
    const prompt = source("services/database/planned-meal-prompt-context.ts");
    const quality = source("app/api/admin/quality/route.ts");
    const qualityReadModel = source("services/food-catalog/server/current-generation-quality.ts");

    expect(prompt).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(quality).toContain("getCurrentGenerationQuality");
    expect(quality).not.toMatch(/\.from\(["']food_items["']\)/);
    expect(qualityReadModel).toContain("food_catalog_current_generation");
    expect(qualityReadModel).toContain("food_catalog_generation_foods");
    expect(qualityReadModel).not.toMatch(/\.from\(["']food_items["']\)/);
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
});
