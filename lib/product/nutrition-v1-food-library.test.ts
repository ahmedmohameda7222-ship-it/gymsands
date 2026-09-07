import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const pagePath = "components/nutrition/food-library/food-library-page.tsx";
const rowPath = "components/nutrition/food-library/food-row.tsx";
const detailPath = "components/nutrition/food-library/food-detail.tsx";
const filtersPath = "components/nutrition/food-library/food-filters.tsx";
const i18nPath = "lib/i18n/nutrition-v1.ts";

function expectKeys(value: string, keys: string[]) {
  for (const key of keys) expect(value, key).toContain(`nt("${key}")`);
}

describe("Nutrition V1 canonical Food Library product surface", () => {
  it("implements the complete planned reader/route/page/component surface", () => {
    for (const path of [
      "services/nutrition-v1/server/food-library.ts",
      "app/api/nutrition/v1/foods/route.ts",
      "app/(private)/calories/food-hub/page.tsx",
      pagePath,
      rowPath,
      detailPath,
      filtersPath,
    ]) expect(existsSync(join(root, path)), path).toBe(true);
  });

  it("replaces the normal Food Hub path with localized search-first Food Library, personal Quick Access, then Category/Cuisine browse", () => {
    const routePage = source("app/(private)/calories/food-hub/page.tsx");
    const page = source(pagePath);
    const i18n = source(i18nPath);
    expect(routePage).toContain("FoodLibraryPage");
    expect(page).toContain("useNutritionV1Translation");
    expectKeys(page, ["foodLibrary", "searchFoods", "quickAccess", "recent", "favorites", "myFoods", "browseByCategory", "browseByCuisine"]);
    expect(i18n).toContain('foodLibrary: "Food Library"');
    expect(i18n).toContain('foodLibrary: "Lebensmittelbibliothek"');
    expect(i18n).toContain('foodLibrary: "مكتبة الأطعمة"');
    expect(page).not.toMatch(/nutrition dashboard|marketing hero|grid-cols-3|grid-cols-4/i);
  });

  it("uses flat decision rows with explicit localized macro labels, objective tags, and positive-only Plaivra verification", () => {
    const row = source(rowPath);
    expect(row).toContain("useNutritionV1Translation");
    expect(row).toContain("ShieldCheck");
    expect(row).toContain('aria-label={nt("plaivraVerified")}');
    expectKeys(row, ["macroProtein", "macroCarbs", "macroFat", "highProtein", "lowCarb"]);
    expect(row).toContain('"g"');
    expect(row).toContain("min-h-[88px]");
    expect(row).not.toMatch(/Unverified|confidence|source name|trust level|Saved Meal/i);
    expect(row).not.toMatch(/<Card|CardHeader|CardContent/);
  });

  it("keeps discovery labels restrained and result layout to at most two columns", () => {
    const row = source(rowPath);
    const page = source(pagePath);
    expect(row).toContain("const nutritionLabels = food.nutritionLabels ?? []");
    expect(row).toContain('normalized !== "high protein"');
    expect(row).toContain('normalized !== "low carb"');
    expect(row).toContain("nutritionLabels.map");
    expect(row).toContain("Math.max(0, 2 - nutritionLabels.length)");
    expect(page).toContain("lg:grid-cols-2");
    expect(page).not.toMatch(/grid-cols-3|grid-cols-4/);
  });

  it("uses localized live filters with close-preserves-state semantics, nutrition Info, presets, and no Apply/Done gate", () => {
    const filters = source(filtersPath);
    const i18n = source(i18nPath);
    expect(filters).toContain("useNutritionV1Translation");
    expectKeys(filters, ["foodFilters", "closeFilters", "highProtein", "lowCarb", "info", "nutritionFilterInfo", "resetFilters"]);
    expect(i18n).toContain('proteinMinimum: "Protein ≥"');
    expect(i18n).toContain('carbsMaximum: "Carbs ≤"');
    expect(i18n).toContain("≥");
    expect(i18n).toContain("≤");
    expect(filters).not.toMatch(/>\s*Apply\s*</i);
    expect(filters).not.toMatch(/>\s*Done\s*</i);
  });

  it("resolves Serving then Quantity then Destination for standalone Add To and excludes Shopping List", () => {
    const detail = source(detailPath);
    const servingIndex = detail.indexOf('nt("serving")');
    const quantityIndex = detail.indexOf('nt("quantity")');
    const destinationIndex = detail.indexOf('<h3 className="text-sm font-semibold">{nt("addTo")}</h3>');
    expect(detail).toContain("useNutritionV1Translation");
    expect(servingIndex).toBeGreaterThanOrEqual(0);
    expect(quantityIndex).toBeGreaterThan(servingIndex);
    expect(destinationIndex).toBeGreaterThan(quantityIndex);
    expectKeys(detail, ["diary", "mealPlan", "savedMeal", "recipe"]);
    expect(detail).not.toContain("/my-meal-plan/shopping");
  });

  it("keeps Food Detail bounded and truthful about missing nutrition", () => {
    const detail = source(detailPath);
    expectKeys(detail, ["moreNutrition", "notAvailable", "usingYourValues"]);
    expect(detail).toMatch(/max-w-\[(420|440|460|480)px\]/);
  });

  it("queries the server route instead of fetching and slicing the whole catalog in the browser", () => {
    const page = source(pagePath);
    expect(page).toContain("/api/nutrition/v1/foods");
    expect(page).not.toMatch(/food_items[\s\S]{0,400}\.slice\(/);
    expect(page).not.toMatch(/getGlobalFoods\(/);
  });
});